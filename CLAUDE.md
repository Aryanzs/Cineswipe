# CLAUDE.md — CineSwipe Complete Reference

## Commands

```bash
npm run dev      # Vite dev server on port 5175
npm run build    # Production build → dist/
npm run preview  # Preview production build
npm run lint     # tsc --noEmit (type-check only, no emit)
```

No automated tests. No Express server — pure frontend Vite/React app backed by Supabase + TMDB.

## URL Routing

Uses React Router v6 (`BrowserRouter`). All navigation state lives in the URL:

| URL | View | Provider | Type |
|-----|------|----------|------|
| `/` | swipe | all | movies |
| `/tv` | swipe | all | TV |
| `/netflix` | swipe | Netflix | movies |
| `/netflix/tv` | swipe | Netflix | TV |
| `/prime`, `/hotstar`, `/jio` | swipe | respective | movies |
| `/mylist` | watchlist | all | movies |
| `/mylist/tv` | watchlist | all | TV |
| `/mylist/netflix` | watchlist | Netflix | movies |
| `/mylist/netflix/tv` | watchlist | Netflix | TV |

Provider slugs: `netflix=8`, `prime=119`, `hotstar=122`, `jio=220`

Routes defined in `src/main.tsx` inside `RootComponent` (shown only when `user` is set). `vercel.json` rewrites all paths to `index.html` for SPA routing on Vercel.

## Environment Variables (`.env.local`)

```
VITE_TMDB_API_KEY=       # Required. From https://www.themoviedb.org/settings/api
VITE_SUPABASE_URL=       # Supabase project → Settings → API → Project URL
VITE_SUPABASE_ANON_KEY=  # Supabase project → Settings → API → anon/public key
```

Missing TMDB key → App renders "Setup Required" error screen. Missing Supabase vars → blank crash.

---

## Architecture

Pure client-side React SPA. No backend server. All auth and data via Supabase. Movie data via TMDB REST API called directly from the browser.

```
index.html
└── src/main.tsx              ← entry point, providers + auth gate
    └── AuthProvider          ← manages Supabase session
        └── RootComponent     ← shows spinner / AuthScreen / App
            ├── AuthScreen    ← login/signup UI
            └── App.tsx       ← main app (swipe queue + list view)
                ├── SwipeCard    ← draggable movie card (Framer Motion)
                ├── MyList       ← liked movies grid
                └── MediaModal   ← bottom-sheet detail view
```

---

## File-by-File Reference

### `src/main.tsx`
Entry point. Renders into `#root`.
- **`ErrorBoundary`** (class component): catches render errors, shows "Reload app" button
- **`RootComponent`**: reads `{ user, loading }` from `useAuth()`. `loading` → spinner. `user` → `<App />`. Else → `<AuthScreen />`.
- **`Toaster`** (react-hot-toast): bottom-center, dark theme

---

### `src/contexts/AuthContext.tsx`
Central auth state. Provides `{ user, loading, signIn, signUp, logout }`.

**User object**: `{ id: string (UUID), username: string }`

**Fake email trick**: Supabase requires email. UI is username-only, so emails are synthesized as `${username.toLowerCase()}@cineswipe.app` via `toEmail()` helper.

**Session restoration — CRITICAL pattern (do not change without understanding this):**
```ts
// Dual-resolver: whichever fires first (getSession OR INITIAL_SESSION event)
// calls setLoading(false). Guards against getSession() hanging (network issues,
// Supabase sleeping, slow token refresh) AND against onAuthStateChange delays.
let resolved = false;
const done = () => { if (!resolved) { resolved = true; setLoading(false); } };

supabase.auth.getSession().then(async ({ data: { session } }) => {
  try {
    if (session?.user) {
      const username = await loadProfile(session.user.id);
      if (username) setUser({ id: session.user.id, username });
    }
  } catch {}
  finally { done(); }
}).catch(done); // handles getSession() itself rejecting

supabase.auth.onAuthStateChange(async (event, session) => {
  try { /* setUser logic */ }
  catch { setUser(null); }
  finally {
    if (event === 'INITIAL_SESSION') done(); // fallback if getSession hangs
  }
});
```

**Why dual-resolver**: `getSession()` can hang if the token needs refreshing and the network is slow/Supabase is sleeping (free-tier). `onAuthStateChange(INITIAL_SESSION)` fires independently. Either one resolves loading. The `resolved` flag ensures `setLoading(false)` is called exactly once. Also has `.catch(done)` for the rare case `getSession()` itself rejects.

**`loadProfile(userId)`**: queries `profiles` table, returns `username` string or `null`.

**`signUp` flow**:
1. Check `profiles` for duplicate username (`maybeSingle()`)
2. `supabase.auth.signUp({ email: toEmail(username), password })`
3. Insert `{ user_id, username }` into `profiles`
4. Immediately `setUser(...)` — no email confirmation (disabled in Supabase dashboard)

**`signIn`**: `signInWithPassword()` → user state update via `onAuthStateChange`. Throws generic error on failure.

**`logout`**: `supabase.auth.signOut()` + `setUser(null)`.

---

### `src/lib/supabase.ts`
Supabase client singleton.
```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: window.sessionStorage }
});
```
**`storage: sessionStorage`** → session clears on tab close. User must re-login next open. To enable persistent login across tab closes, remove the `auth` config (defaults to localStorage).

---

### `src/App.tsx`
Main view controller. Navigation state is URL-derived via React Router.

**URL-derived values (not useState — read from router):**
```tsx
const { provider: providerSlug } = useParams<{ provider?: string }>();
const location = useLocation();
const navigate = useNavigate();

const view        = location.pathname.startsWith('/mylist') ? 'list' : 'swipe';
const mediaType   = location.pathname.endsWith('/tv') ? 'tv' : 'movie';
const activeProvider = PROVIDERS.find(p => p.slug === providerSlug)?.id ?? null;
```

**`buildPath(v, pId, t)`** — central navigation helper used by all 5 filter buttons:
```ts
// buildPath('swipe', 8, 'tv')   → '/netflix/tv'
// buildPath('list', null, 'movie') → '/mylist'
// buildPath('swipe', null, 'tv')   → '/tv'
```

**State** (data only — no nav state):
- `movies: Media[]` — swipe queue. Index 0 = top card.
- `likedMovies: Media[]` — derived from interactions, used for seen-filter + list display
- `rejectedMovies: Media[]` — used to filter seen items from fetches
- `interactions: Interaction[]` — raw DB rows (needed for `interaction.id` to delete)
- `loading` — card queue fetch
- `interactionsLoading` — interactions fetch
- `selectedMedia: Media | null` — drives MediaModal
- `pageRef = useRef(1)` — TMDB page number (ref, not state — no re-render needed)

**PROVIDERS** (TMDB watch provider IDs, IN region):
```tsx
{ id: null, slug: null,      name: 'All'         }
{ id: 8,    slug: 'netflix', name: 'Netflix'     }
{ id: 119,  slug: 'prime',   name: 'Prime Video' }
{ id: 122,  slug: 'hotstar', name: 'Hotstar'     }
{ id: 220,  slug: 'jio',     name: 'JioCinema'   }
```

**`exploreMode: boolean`** — persisted in `localStorage` as `cs_explore_mode`. Toggled via the "For You / Explore" button in the header.

**Effects (sequential init pattern — critical for correct seen-filtering):**
- Effect 1 `[user?.id]` → resets `initializedRef.current = false`, calls `fetchInteractions()` (returns data + updates state), then calls `loadInitialMovies({ seenIds, liked })` with fresh data, then sets `initializedRef.current = true`.
- Effect 2 `[mediaType, activeProvider, exploreMode]` → guarded by `initializedRef.current` (skips until Effect 1 completes). Calls `loadInitialMovies()` with no args (reads from populated state). This is what fires on URL navigation and mode toggle.
- **Why this matters**: on initial load, both effects fire simultaneously. The ref guard ensures movies only load AFTER interactions are fetched — prevents liked/rejected items from appearing in the swipe queue.

**Key functions**:
- `fetchInteractions()`: Supabase query ordered by `created_at desc`. Updates state AND returns `{ liked, rejected }` for immediate use on init.
- `saveInteraction(media, type)`: Supabase upsert, conflict key `(user_id, media_id, media_type)`. Fire-and-forget with toast on error.
- `removeInteraction(id)`: Delete row, filter from local state.
- `loadInitialMovies(opts?)`: Accepts optional `{ seenIds, liked }` (only passed from Effect 1 init). Logic:
  - **For You + has likes**: fetch recommendations for last 3 liked titles of current `mediaType`. If ≥ 5 unique recs → use them. Else supplement with discover.
  - **For You + no likes** OR **Explore mode**: use `getDiscoverMedia` with a random starting page. Explore mode uses `{ sort_by: 'vote_average.desc', 'vote_count.gte': '300' }` to surface acclaimed films.
  - Always sets `pageRef.current` to the actual page used.
- `fetchMoreMovies()`: Increment `pageRef`, fetch next page (respects `exploreMode` params), append filtered results.
- `handleSwipe(direction, media)`:
  - Right: add to `likedMovies`, save interaction, async fetch recommendations → filter by `mediaType` + seen IDs → splice up to 5 into queue[2]
  - Left: add to `rejectedMovies`, save interaction
  - Both: remove queue[0], if remaining < 5 → `fetchMoreMovies()`

**List view filtering** (client-side on fetched data):
```ts
const filteredLikedMovies = likedMovies.filter(m =>
  m.media_type === mediaType &&
  (activeProvider === null || m.provider_id === activeProvider)
);
```
Note: recommendations don't have `provider_id` (set to undefined). They won't show under a provider filter.

**Render structure**:
```
<div h-screen flex-col overflow-hidden>
  <header>  ← title, view toggle, logout btn, movie/tv buttons, provider chip scroll
  <main flex-1 overflow-x-hidden>  ← overflow-x-hidden NOT overflow-hidden (buttons clip otherwise)
    swipe view:
      - card stack: movies.slice(0,3).reverse() (reversed = index 0 on top visually)
      - X / Heart buttons (hidden when queue empty)
    list view:
      - "Your Watchlist" heading + count
      - <MyList> or loading spinner
  <AnimatePresence> → <MediaModal> when selectedMedia set
```

---

### `src/components/SwipeCard.tsx`
Draggable card with Framer Motion (`motion/react` v12).

**Motion values**:
- `x` — tracks horizontal drag position
- `rotate` → `x [-200,200]` maps to `[-10,10]` deg tilt
- `likeOpacity` → `x [0,100]` maps to `[0,1]` ("LIKE" stamp)
- `nopeOpacity` → `x [0,-100]` maps to `[0,1]` ("NOPE" stamp)
- `controls = useAnimation()` — programmatic fly-off and snap-back

**Drag threshold**: 100px. Past threshold → animate to `x: ±500, opacity: 0` (0.2s) then call `onSwipe`. Within → spring snap back.

**Stack effect**: Top 3 cards rendered. Non-top cards:
- `scale = 1 - index * 0.05`
- `yOffset = index * 15px`

**Info button**: Placed on OUTER `motion.div` (no overflow-hidden), not inside inner drag div. This prevents the button from being clipped by `overflow-hidden` on the card image container. The inner `motion.div` handles drag, has `overflow-hidden`, hosts the poster image + overlays.

---

### `src/components/AuthScreen.tsx`
Login/signup form. `isLogin` state toggles mode.

**Validation (signup only)**:
- Username: 3–30 chars, `/^[a-zA-Z0-9_]+$/`
- Password: min 8 chars

Calls `signIn` or `signUp` from `useAuth()`. Both throw → caught locally, shown in error div.

---

### `src/components/MyList.tsx`
Responsive grid of liked movies.
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
- Hover reveals: info button, trash button, title/year/rating overlay
- **Finding interaction for removal**: `interactions.find(i => i.media_data.id === media.id)` — gets `interaction.id` (UUID) for delete call
- **Share**: `navigator.share()` → fallback to `navigator.clipboard.writeText()` + toast

---

### `src/components/MediaModal.tsx`
Bottom sheet. Slides up from bottom (`y: '100%'` → `y: 0`, spring animation).
- Backdrop click → dismiss
- Shows: backdrop image, title, year, type, star rating, genre tags (from `GENRE_MAP`), overview, TMDB external link
- **`GENRE_MAP`**: hardcoded `Record<number, string>` mapping TMDB genre IDs to readable names (both movie + TV genres)

---

### `src/services/tmdb.ts`
All TMDB API calls. Client-side, reads `VITE_TMDB_API_KEY`.

- **`getDiscoverMedia(type, page, providerId?, extraParams?)`**: `/discover/movie|tv`, sorted `popularity.desc`, `watch_region: IN`. `extraParams` can override `sort_by` or add filters like `vote_count.gte`. Adds `media_type` and `provider_id` to each result.
- **`getRecommendations(mediaId, type)`**: `/${type}/${mediaId}/recommendations`. No `provider_id` on results.
- **`getImageUrl(path, size='w500')`**: `https://image.tmdb.org/t/p/${size}${path}`. Null → placeholder.

---

### `src/types.ts`
```ts
interface Media {
  id: number;
  title?: string;          // movies
  name?: string;           // TV shows
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;   // movies
  first_air_date?: string; // TV
  vote_average: number;
  genre_ids: number[];
  media_type: 'movie' | 'tv';
  provider_id?: number | null; // set by getDiscoverMedia; undefined for recommendations
}

interface Interaction {
  id: string;              // UUID
  user_id: string;         // UUID
  media_id: number;
  media_type: 'movie' | 'tv';
  interaction_type: 'like' | 'reject';
  media_data: Media;       // full Media stored as JSONB in DB
  created_at: string;
}
```

---

### `src/index.css`
- Imports Inter (body) + Playfair Display (headings) from Google Fonts
- `@import "tailwindcss"` — Tailwind v4, no config file
- `@theme`: sets `--font-sans` and `--font-display`
- `.no-scrollbar`: hides scrollbars cross-browser
- `body`: `background: #000; overflow: hidden` (app uses `h-screen`, body must not scroll)

---

### `vite.config.ts`
```ts
plugins: [react(), tailwindcss()]    // Tailwind v4 via vite plugin (no tailwind.config.js)
resolve.alias: { '@': projectRoot }  // @/ imports resolve to project root
server.port: 5175                    // avoids service worker conflicts with other apps on 5173
```

---

## Supabase Setup

### Required Tables

**`profiles`**:
```sql
CREATE TABLE profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
```

**`interactions`**:
```sql
CREATE TABLE interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('like','reject')),
  media_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, media_id, media_type)
);
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own" ON interactions USING (auth.uid() = user_id);
```

### Auth Settings
- Supabase Dashboard → Authentication → Sign In / Providers → Email → **Disable "Confirm email"**
- Required because emails are fake (`@cineswipe.app`) and cannot receive confirmation emails

### Fix unconfirmed user (confirmed_at = null):
```sql
UPDATE auth.users
SET confirmed_at = NOW(), email_confirmed_at = NOW()
WHERE email = 'username@cineswipe.app';
```

---

## Decisions & Gotchas

| Issue | Decision |
|-------|----------|
| Username-only auth | Fake email `${username}@cineswipe.app` to satisfy Supabase |
| Infinite loading on reload/reopen | Dual-resolver: `getSession()` + `onAuthStateChange(INITIAL_SESSION)` both call `done()` (guarded by `resolved` flag). Whichever fires first wins. `.catch(done)` handles `getSession()` rejecting. |
| Session persistence | `storage: sessionStorage` → clears on tab close. Remove for persistent sessions (use localStorage default) |
| Info button clipping | Outer `motion.div` (no overflow) holds button; inner `motion.div` has `overflow-hidden` |
| X/Heart button clipping | `overflow-x-hidden` on `<main>`, NOT `overflow-hidden` (the latter clips absolutely-positioned children) |
| Dev port | 5175 to avoid service worker conflicts with other local apps on 5173 |
| Navigation state | URL-derived via React Router — no useState for view/provider/mediaType. `buildPath(v,pId,t)` in App.tsx builds all paths |
| TMDB region | `watch_region: 'IN'` hardcoded. Provider IDs are IN-region specific |
| Queue replenishment | Trigger: `queue.length < 5`. Recommendations: splice 5 items at position 2 on right swipe |
| `provider_id` on recommendations | Undefined — recommendations won't show under provider filters by design |
| Seen items in swipe queue | Fixed via `initializedRef` — Effect 2 (movie load) is gated until Effect 1 (interactions) completes |
| Explore mode params | `{ sort_by: 'vote_average.desc', vote_count.gte: '300' }` — surfaces acclaimed films, stored in `EXPLORE_PARAMS` constant |
| Same movies every session | For You mode: seeded from recommendations of recent likes. No likes: random page 1–3. Explore: random page 1–10 |
