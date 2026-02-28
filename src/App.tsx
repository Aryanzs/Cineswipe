import { useState, useEffect, useRef } from 'react';
import { Media, Interaction } from './types';
import { getDiscoverMedia, getRecommendations } from './services/tmdb';
import { SwipeCard } from './components/SwipeCard';
import { MyList } from './components/MyList';
import { MediaModal } from './components/MediaModal';
import { Film, Heart, X, Loader2, Tv, LogOut } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useAuth } from './contexts/AuthContext';
import toast from 'react-hot-toast';

const PROVIDERS = [
  { id: null, name: 'All' },
  { id: 8, name: 'Netflix' },
  { id: 119, name: 'Prime Video' },
  { id: 122, name: 'Hotstar' },
  { id: 220, name: 'JioCinema' },
];

export default function App() {
  const { user, token, logout } = useAuth();
  const [movies, setMovies] = useState<Media[]>([]);
  const [likedMovies, setLikedMovies] = useState<Media[]>([]);
  const [rejectedMovies, setRejectedMovies] = useState<Media[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [view, setView] = useState<'swipe' | 'list'>('swipe');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);

  // Filters — persisted to localStorage
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>(() =>
    (localStorage.getItem('cs_filter_type') as 'movie' | 'tv') || 'movie'
  );
  const [activeProvider, setActiveProvider] = useState<number | null>(() => {
    const stored = localStorage.getItem('cs_filter_provider');
    return stored !== null ? (stored === 'null' ? null : parseInt(stored)) : null;
  });

  const pageRef = useRef(1);

  // Persist filter changes
  useEffect(() => {
    localStorage.setItem('cs_filter_type', mediaType);
  }, [mediaType]);

  useEffect(() => {
    localStorage.setItem('cs_filter_provider', String(activeProvider));
  }, [activeProvider]);

  useEffect(() => {
    if (token) {
      fetchInteractions();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadInitialMovies();
    }
  }, [mediaType, activeProvider, token]);

  const fetchInteractions = async () => {
    try {
      const res = await fetch('/api/interactions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch interactions');
      const data: Interaction[] = await res.json();

      setInteractions(data);
      setLikedMovies(data.filter(i => i.interaction_type === 'like').map(i => i.media_data));
      setRejectedMovies(data.filter(i => i.interaction_type === 'reject').map(i => i.media_data));
    } catch (err) {
      console.error(err);
    }
  };

  const saveInteraction = async (media: Media, type: 'like' | 'reject') => {
    try {
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          media_id: media.id,
          media_type: media.media_type,
          interaction_type: type,
          media_data: media
        })
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      toast.error('Could not save your choice. Check your connection.');
    }
  };

  const removeInteraction = async (interactionId: number) => {
    try {
      const res = await fetch(`/api/interactions/${interactionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to remove');

      setInteractions(prev => prev.filter(i => i.id !== interactionId));
      setLikedMovies(prev => prev.filter(m => {
        const interaction = interactions.find(i => i.id === interactionId);
        return interaction ? m.id !== interaction.media_data.id : true;
      }));
      toast.success('Removed from watchlist');
    } catch {
      toast.error('Could not remove item. Try again.');
    }
  };

  const loadInitialMovies = async () => {
    try {
      setLoading(true);
      setError(null);
      pageRef.current = 1;
      const trending = await getDiscoverMedia(mediaType, pageRef.current, activeProvider);

      const seenIds = new Set([
        ...likedMovies.map((m: Media) => m.id),
        ...rejectedMovies.map((m: Media) => m.id)
      ]);

      setMovies(trending.filter(m => !seenIds.has(m.id)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreMovies = async () => {
    try {
      pageRef.current += 1;
      const trending = await getDiscoverMedia(mediaType, pageRef.current, activeProvider);
      const seenIds = new Set([
        ...likedMovies.map(m => m.id),
        ...rejectedMovies.map(m => m.id),
        ...movies.map(m => m.id)
      ]);
      const newMovies = trending.filter(m => !seenIds.has(m.id));
      setMovies(prev => [...prev, ...newMovies]);
    } catch {
      // Silent — queue still has cards
    }
  };

  const handleSwipe = async (direction: 'left' | 'right', media: Media) => {
    if (direction === 'right') {
      const newLiked = [...likedMovies, media];
      setLikedMovies(newLiked);
      saveInteraction(media, 'like');

      getRecommendations(media.id, media.media_type).then(recs => {
        const seenIds = new Set([
          ...newLiked.map(m => m.id),
          ...rejectedMovies.map(m => m.id),
          ...movies.map(m => m.id)
        ]);
        const newMovies = recs.filter(m => !seenIds.has(m.id)).slice(0, 5);
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
      if (next.length < 5) {
        fetchMoreMovies();
      }
      return next;
    });
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

  // Filter liked movies based on current filters for the list view
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
      <header className="flex flex-col gap-4 p-6 z-50 bg-gradient-to-b from-black to-transparent">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-display tracking-wide italic">CineSwipe</h1>
          <div className="flex gap-2 items-center">
            <div className="flex gap-2 bg-zinc-900/50 p-1 rounded-full border border-white/10 backdrop-blur-md">
              <button
                onClick={() => setView('swipe')}
                className={`p-3 rounded-full transition-colors ${view === 'swipe' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                aria-label="Swipe view"
              >
                <Film size={18} />
              </button>
              <button
                onClick={() => setView('list')}
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
          <div className="flex gap-2">
            <button
              onClick={() => setMediaType('movie')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${mediaType === 'movie' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:text-white'}`}
            >
              <Film size={14} /> Movies
            </button>
            <button
              onClick={() => setMediaType('tv')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${mediaType === 'tv' ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:text-white'}`}
            >
              <Tv size={14} /> Series
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {PROVIDERS.map(provider => (
              <button
                key={provider.id || 'all'}
                onClick={() => setActiveProvider(provider.id)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${activeProvider === provider.id ? 'bg-emerald-500 text-black' : 'bg-zinc-900 text-zinc-400 border border-white/10 hover:text-white'}`}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex flex-col items-center justify-center px-4 pb-6">
        {view === 'swipe' ? (
          <>
            <div className="relative w-full max-w-sm aspect-[2/3] max-h-[65vh] flex items-center justify-center">
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
            <div className="flex items-center justify-between px-6 mb-4">
              <h2 className="text-3xl font-display">Your Watchlist</h2>
              {filteredLikedMovies.length > 0 && (
                <span className="text-zinc-500 text-sm">{filteredLikedMovies.length} titles</span>
              )}
            </div>
            <MyList
              mediaList={filteredLikedMovies}
              interactions={filteredInteractions}
              onRemove={removeInteraction}
              onInfo={setSelectedMedia}
            />
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
