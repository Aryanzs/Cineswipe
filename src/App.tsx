import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Media, Interaction } from './types';
import { getDiscoverMedia, getRecommendations } from './services/tmdb';
import { SwipeCard } from './components/SwipeCard';
import { MyList } from './components/MyList';
import { MediaModal } from './components/MediaModal';
import { Film, Heart, X, Loader2, Tv, LogOut, Sparkles, Compass } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import toast from 'react-hot-toast';

const PROVIDERS: { id: number | null; name: string; slug: string | null }[] = [
  { id: null, name: 'All',         slug: null      },
  { id: 8,    name: 'Netflix',     slug: 'netflix' },
  { id: 119,  name: 'Prime Video', slug: 'prime'   },
  { id: 122,  name: 'Hotstar',     slug: 'hotstar' },
  { id: 220,  name: 'JioCinema',   slug: 'jio'     },
];

// Build a URL path from view + provider + mediaType
const buildPath = (
  v: 'swipe' | 'list',
  pId: number | null,
  t: 'movie' | 'tv'
): string => {
  const slug = PROVIDERS.find(p => p.id === pId)?.slug ?? null;
  const tv = t === 'tv' ? '/tv' : '';
  if (v === 'list') return slug ? `/mylist/${slug}${tv}` : `/mylist${tv}`;
  return slug ? `/${slug}${tv}` : (t === 'tv' ? '/tv' : '/');
};

// Explore mode discover params: acclaimed films outside popularity charts
const EXPLORE_PARAMS = { sort_by: 'vote_average.desc', 'vote_count.gte': '300' };

export default function App() {
  const { provider: providerSlug } = useParams<{ provider?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // All navigation state is derived from the URL — no useState for view/provider/mediaType
  const view: 'swipe' | 'list' = location.pathname.startsWith('/mylist') ? 'list' : 'swipe';
  const mediaType: 'movie' | 'tv' = location.pathname.endsWith('/tv') ? 'tv' : 'movie';
  const activeProvider: number | null = PROVIDERS.find(p => p.slug === providerSlug)?.id ?? null;

  // Explore mode: "For You" (recommendations) vs "Explore" (different discovery)
  const [exploreMode, setExploreMode] = useState(() =>
    localStorage.getItem('cs_explore_mode') === 'true'
  );

  const [movies, setMovies] = useState<Media[]>([]);
  const [likedMovies, setLikedMovies] = useState<Media[]>([]);
  const [rejectedMovies, setRejectedMovies] = useState<Media[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [interactionsLoading, setInteractionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);

  const pageRef = useRef(1);

  // --- Effect 1: Fetch interactions whenever the user changes ---
  useEffect(() => {
    if (user) fetchInteractions();
  }, [user?.id]);

  // --- Effect 2: Load movies after interactions are ready, or when filters change ---
  // interactionsLoading starts true, so this skips until fetchInteractions() completes.
  // On filter/mode changes it fires immediately (interactionsLoading is already false).
  useEffect(() => {
    if (!user || interactionsLoading) return;
    loadInitialMovies();
  }, [user?.id, mediaType, activeProvider, exploreMode, interactionsLoading]);

  // Returns the fetched data AND updates state
  const fetchInteractions = async (): Promise<{ liked: Media[]; rejected: Media[] }> => {
    if (!user) return { liked: [], rejected: [] };
    setInteractionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Interaction[];
      setInteractions(rows);
      const liked = rows.filter(i => i.interaction_type === 'like').map(i => i.media_data);
      const rejected = rows.filter(i => i.interaction_type === 'reject').map(i => i.media_data);
      setLikedMovies(liked);
      setRejectedMovies(rejected);
      return { liked, rejected };
    } catch (err) {
      console.error(err);
      return { liked: [], rejected: [] };
    } finally {
      setInteractionsLoading(false);
    }
  };

  // opts is only passed on the initial load (from effect 1) where state hasn't updated yet.
  // On filter/mode changes (effect 2), called with no args — reads from state which is populated.
  const loadInitialMovies = async (opts?: { seenIds: Set<number>; liked: Media[] }) => {
    try {
      setLoading(true);
      setError(null);

      const seenIds = opts?.seenIds ?? new Set([
        ...likedMovies.map(m => m.id),
        ...rejectedMovies.map(m => m.id),
      ]);
      const liked = opts?.liked ?? likedMovies;

      let queue: Media[] = [];

      // --- For You mode: seed queue from recommendations of recently liked titles ---
      const recentLikedForType = liked
        .filter(m => m.media_type === mediaType)
        .slice(0, 3);

      if (!exploreMode && recentLikedForType.length > 0) {
        const recResults = await Promise.allSettled(
          recentLikedForType.map(m => getRecommendations(m.id, m.media_type))
        );

        const allRecs = recResults
          .flatMap(r => r.status === 'fulfilled' ? r.value : [])
          .filter(m => m.media_type === mediaType && !seenIds.has(m.id));

        // Deduplicate by id
        const uniqueRecs = [...new Map(allRecs.map(m => [m.id, m])).values()];

        if (uniqueRecs.length >= 5) {
          // Enough recommendations — use them directly
          pageRef.current = 1;
          queue = uniqueRecs;
        } else {
          // Supplement with discovery
          pageRef.current = 1;
          const recIds = new Set(uniqueRecs.map(m => m.id));
          const discover = await getDiscoverMedia(mediaType, pageRef.current, activeProvider);
          const extra = discover.filter(m => !seenIds.has(m.id) && !recIds.has(m.id));
          queue = [...uniqueRecs, ...extra];
        }
      }

      // --- Explore mode OR no liked titles yet: varied discovery ---
      if (queue.length === 0) {
        if (exploreMode) {
          // Acclaimed films, random starting page for variety
          const page = Math.floor(Math.random() * 10) + 1;
          pageRef.current = page;
          const movies = await getDiscoverMedia(mediaType, page, activeProvider, EXPLORE_PARAMS);
          queue = movies.filter(m => !seenIds.has(m.id));
        } else {
          // No likes yet: random page so the queue is different each session
          const page = Math.floor(Math.random() * 3) + 1;
          pageRef.current = page;
          const movies = await getDiscoverMedia(mediaType, page, activeProvider);
          queue = movies.filter(m => !seenIds.has(m.id));
        }
      }

      setMovies(queue);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreMovies = async () => {
    try {
      pageRef.current += 1;
      const params = exploreMode ? EXPLORE_PARAMS : {};
      const trending = await getDiscoverMedia(mediaType, pageRef.current, activeProvider, params);

      const seenIds = new Set([
        ...likedMovies.map(m => m.id),
        ...rejectedMovies.map(m => m.id),
        ...movies.map(m => m.id),
      ]);
      const newMovies = trending.filter(m => !seenIds.has(m.id));
      setMovies(prev => [...prev, ...newMovies]);
    } catch {
      // Silent — queue still has cards
    }
  };

  const saveInteraction = async (media: Media, type: 'like' | 'reject') => {
    if (!user) return;
    try {
      const { error } = await supabase.from('interactions').upsert(
        {
          user_id: user.id,
          media_id: media.id,
          media_type: media.media_type,
          interaction_type: type,
          media_data: media,
        },
        { onConflict: 'user_id,media_id,media_type' }
      );
      if (error) throw error;
    } catch {
      toast.error('Could not save your choice. Check your connection.');
    }
  };

  const removeInteraction = async (interactionId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('interactions')
        .delete()
        .eq('id', interactionId)
        .eq('user_id', user.id);

      if (error) throw error;

      setInteractions(prev => {
        const removed = prev.find(i => i.id === interactionId);
        if (removed) {
          setLikedMovies(lm => lm.filter(m => m.id !== removed.media_data.id));
        }
        return prev.filter(i => i.id !== interactionId);
      });
      toast.success('Removed from watchlist');
    } catch {
      toast.error('Could not remove item. Try again.');
    }
  };

  const handleSwipe = async (direction: 'left' | 'right', media: Media) => {
    if (direction === 'right') {
      const newLiked = [...likedMovies, media];
      setLikedMovies(newLiked);
      saveInteraction(media, 'like');

      // Splice recommendations right after the top 2 cards
      getRecommendations(media.id, media.media_type).then(recs => {
        const seenIds = new Set([
          ...newLiked.map(m => m.id),
          ...rejectedMovies.map(m => m.id),
          ...movies.map(m => m.id),
        ]);
        const newMovies = recs
          .filter(m => m.media_type === mediaType && !seenIds.has(m.id))
          .slice(0, 5);
        if (newMovies.length > 0) {
          setMovies(prev => {
            const current = [...prev];
            current.splice(2, 0, ...newMovies);
            return current;
          });
        }
      }).catch(() => undefined);

    } else {
      const newRejected = [...rejectedMovies, media];
      setRejectedMovies(newRejected);
      saveInteraction(media, 'reject');
    }

    setMovies(prev => {
      const next = prev.slice(1);
      if (next.length < 5) fetchMoreMovies();
      return next;
    });
  };

  const toggleExploreMode = () => {
    const next = !exploreMode;
    setExploreMode(next);
    localStorage.setItem('cs_explore_mode', String(next));
  };

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-[32px] border border-white/10">
          <h1 className="text-3xl font-display mb-4">Setup Required</h1>
          <p className="text-zinc-400 mb-6">{error}</p>
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">1. Get a free API key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="text-emerald-400 underline">TMDB</a>.</p>
            <p className="text-sm text-zinc-300">2. Add it to your <code className="bg-black px-2 py-1 rounded text-emerald-400">.env.local</code> as <code className="bg-black px-2 py-1 rounded text-emerald-400">VITE_TMDB_API_KEY</code>.</p>
            <p className="text-sm text-zinc-300">3. Restart the dev server.</p>
          </div>
        </div>
      </div>
    );
  }

  // Filter liked movies for the list view based on active filters
  const filteredLikedMovies = likedMovies.filter(m => {
    const typeMatch = m.media_type === mediaType;
    const providerMatch = activeProvider === null || m.provider_id === activeProvider;
    return typeMatch && providerMatch;
  });

  const filteredInteractions = interactions.filter(i => {
    if (i.interaction_type !== 'like') return false;
    const typeMatch = i.media_data.media_type === mediaType;
    const providerMatch = activeProvider === null || i.media_data.provider_id === activeProvider;
    return typeMatch && providerMatch;
  });

  return (
    <div className="h-screen w-full flex flex-col bg-black text-white font-sans overflow-hidden">
      <header className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 z-50 bg-linear-to-b from-black to-transparent">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-display tracking-wide italic">CineSwipe</h1>
          <div className="flex gap-2 items-center">
            <div className="flex gap-2 bg-zinc-900/50 p-1 rounded-full border border-white/10 backdrop-blur-md">
              <button
                onClick={() => navigate(buildPath('swipe', activeProvider, mediaType))}
                className={`p-3 rounded-full transition-colors ${view === 'swipe' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                aria-label="Swipe view"
              >
                <Film size={18} />
              </button>
              <button
                onClick={() => navigate(buildPath('list', activeProvider, mediaType))}
                className={`p-3 rounded-full transition-colors ${view === 'list' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                aria-label="Watchlist view"
              >
                <Heart size={18} />
              </button>
            </div>
            <button
              onClick={logout}
              className="p-3 rounded-full bg-zinc-900/50 border border-white/10 text-zinc-400 hover:text-rose-500 transition-colors backdrop-blur-md ml-2"
              title={`Logout (${user?.username})`}
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          {/* Media type + mode toggle row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => navigate(buildPath(view, activeProvider, 'movie'))}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${mediaType === 'movie' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:text-white'}`}
              >
                <Film size={14} /> Movies
              </button>
              <button
                onClick={() => navigate(buildPath(view, activeProvider, 'tv'))}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${mediaType === 'tv' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:text-white'}`}
              >
                <Tv size={14} /> Series
              </button>
            </div>

            {/* For You / Explore mode toggle */}
            <button
              onClick={toggleExploreMode}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all border ${
                exploreMode
                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30 hover:bg-violet-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              }`}
              title={exploreMode ? 'Switch to recommendations based on your likes' : 'Switch to explore new content'}
            >
              {exploreMode
                ? <><Compass size={12} /> Explore</>
                : <><Sparkles size={12} /> For You</>
              }
            </button>
          </div>

          {/* Provider chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {PROVIDERS.map(provider => (
              <button
                key={provider.slug ?? 'all'}
                onClick={() => navigate(buildPath(view, provider.id, mediaType))}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${activeProvider === provider.id ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:text-white'}`}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 relative overflow-x-hidden flex flex-col items-center justify-center px-4 pb-4">
        {view === 'swipe' ? (
          <>
            <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg aspect-2/3 max-h-[56vh] sm:max-h-[62vh] lg:max-h-[70vh] flex items-center justify-center">
              {loading && movies.length === 0 ? (
                <Loader2 className="animate-spin text-white/50" size={32} />
              ) : (
                <AnimatePresence>
                  {movies.slice(0, 3).reverse().map((movie) => {
                    const originalIndex = movies.findIndex(m => m.id === movie.id);
                    return (
                      <SwipeCard
                        key={movie.id}
                        media={movie}
                        isTop={originalIndex === 0}
                        index={originalIndex}
                        onSwipe={handleSwipe}
                        onInfo={setSelectedMedia}
                      />
                    );
                  })}
                </AnimatePresence>
              )}

              {movies.length === 0 && !loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 border border-white/20 rounded-full flex items-center justify-center mb-6">
                    {mediaType === 'tv' ? <Tv size={32} className="text-white/50" /> : <Film size={32} className="text-white/50" />}
                  </div>
                  <h2 className="text-2xl font-display mb-2">You're all caught up</h2>
                  <p className="text-zinc-500 text-sm">Try changing your filters to find more {mediaType === 'tv' ? 'series' : 'movies'}.</p>
                </div>
              )}
            </div>

            {movies.length > 0 && (
              <div className="flex justify-center gap-8 mt-6 z-50">
                <button
                  onClick={() => handleSwipe('left', movies[0])}
                  className="w-16 h-16 rounded-full border border-rose-500/30 bg-zinc-900 flex items-center justify-center text-rose-500 hover:bg-rose-500/20 hover:border-rose-500 transition-all shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                  aria-label="Skip"
                >
                  <X size={28} strokeWidth={3} />
                </button>
                <button
                  onClick={() => handleSwipe('right', movies[0])}
                  className="w-16 h-16 rounded-full border border-emerald-500/30 bg-zinc-900 flex items-center justify-center text-emerald-500 hover:bg-emerald-500/20 hover:border-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                  aria-label="Like"
                >
                  <Heart size={28} strokeWidth={3} fill="currentColor" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col pt-2">
            <div className="flex items-center justify-between px-4 sm:px-6 mb-4">
              <h2 className="text-2xl sm:text-3xl font-display">Your Watchlist</h2>
              {!interactionsLoading && filteredLikedMovies.length > 0 && (
                <span className="text-zinc-500 text-sm">{filteredLikedMovies.length} titles</span>
              )}
            </div>
            {interactionsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="animate-spin text-white/40" size={32} />
              </div>
            ) : (
              <MyList
                mediaList={filteredLikedMovies}
                interactions={filteredInteractions}
                onRemove={removeInteraction}
                onInfo={setSelectedMedia}
              />
            )}
          </div>
        )}
      </main>

      {/* Media Detail Modal */}
      <AnimatePresence>
        {selectedMedia && (
          <MediaModal media={selectedMedia} onClose={() => setSelectedMedia(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
