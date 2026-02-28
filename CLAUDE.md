# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts Express + Vite together on port 3000)
npm run dev

# Type-check only (no emit)
npm run lint

# Production build (Vite output to dist/)
npm run build

# Production server
npm start
```

There are no automated tests in this project.

## Environment Setup

Copy `.env.example` to `.env.local` and populate:
- `VITE_TMDB_API_KEY` — required for all movie/TV data and posters (get from https://www.themoviedb.org/settings/api)
- `JWT_SECRET` — optional override for the JWT signing secret (defaults to a hardcoded string in server.ts)
- `GEMINI_API_KEY` — present in env example but not actively used in current code

## Architecture

### Unified Dev Server
`server.ts` is the single entry point — it runs an Express server that also serves the Vite dev server as middleware (via `createViteServer` with `middlewareMode: true`). In production, it serves the `dist/` static build instead. Everything runs on port 3000.

### Frontend (React SPA)
- `src/main.tsx` wraps the app in `AuthProvider` and renders either `<AuthScreen>` or `<App>` based on auth state
- `src/App.tsx` is the main view controller — manages the card queue, filter state (media type + streaming provider), and swipe logic
- `src/contexts/AuthContext.tsx` — JWT stored in `localStorage`, validated on mount via `/api/auth/me`

### Backend (Express REST API)
All routes are in `server.ts`:
- `POST /api/auth/register` / `POST /api/auth/login` — returns JWT + user object
- `GET /api/auth/me` — validates token
- `POST /api/interactions` — upserts a like/reject for a media item (stores full media JSON blob)
- `GET /api/interactions` — returns all interactions for the authenticated user

### Database
`server/db.ts` initializes a SQLite file (`cineswipe.db`) using `better-sqlite3` with two tables:
- `users` — id, username (unique), hashed password
- `interactions` — user_id, media_id, media_type, interaction_type (`'like'`/`'reject'`), media_data (JSON string), unique on `(user_id, media_id, media_type)`

### TMDB Integration
`src/services/tmdb.ts` calls the TMDB API client-side using `VITE_TMDB_API_KEY`. Key functions:
- `getDiscoverMedia(type, page, providerId)` — paginated discovery, defaults to `watch_region: 'IN'` (India)
- `getRecommendations(mediaId, type)` — injects up to 5 recommendations into the card queue when a user likes something
- `getImageUrl(path, size)` — constructs TMDB image URLs

### Swipe Queue Logic
`App.tsx` maintains a `movies` array as the card queue. The top card is swipeable. When the queue drops below 5 items, more are fetched. On a right-swipe (like), recommendations for that item are spliced into position 2 of the queue. Already-seen IDs (liked + rejected) are filtered from all fetches.

### Streaming Provider Filter
Hardcoded in `App.tsx`: Netflix (8), Prime Video (119), Hotstar (122), JioCinema (220). Provider IDs are TMDB watch provider IDs for the IN region.

### Key Libraries
- `motion/react` (Framer Motion v12) — swipe drag animations in `SwipeCard`
- `tailwindcss` v4 via `@tailwindcss/vite` plugin (no `tailwind.config.js` needed)
- `better-sqlite3` — synchronous SQLite, server-side only
- `tsx` — runs TypeScript server files directly without compilation
