import { motion } from 'motion/react';
import { Media } from '../types';
import { getImageUrl } from '../services/tmdb';
import { X, Star, Film, Tv, ExternalLink } from 'lucide-react';

interface MediaModalProps {
  media: Media;
  onClose: () => void;
}

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  // TV genres
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics',
};

export const MediaModal = ({ media, onClose }: MediaModalProps) => {
  const title = media.title || media.name;
  const date = media.release_date || media.first_air_date;
  const year = date ? date.split('-')[0] : null;
  const tmdbUrl = `https://www.themoviedb.org/${media.media_type}/${media.id}`;
  const genres = (media.genre_ids || [])
    .map(id => GENRE_MAP[id])
    .filter(Boolean)
    .slice(0, 4);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-[32px] border-t border-white/10 max-h-[85vh] overflow-y-auto no-scrollbar"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Backdrop image */}
        {media.backdrop_path && (
          <div className="relative h-44 mx-4 rounded-2xl overflow-hidden">
            <img
              src={getImageUrl(media.backdrop_path, 'original')}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-linear-to-t from-zinc-900 via-zinc-900/30 to-transparent" />
          </div>
        )}

        <div className="px-6 pb-10">
          {/* Header row */}
          <div className="flex items-start justify-between mt-4 mb-3">
            <div className="flex-1 pr-4">
              <h2 className="text-2xl font-display leading-tight">{title}</h2>
              <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-400">
                {year && <span>{year}</span>}
                <span className="flex items-center gap-1">
                  {media.media_type === 'tv' ? <Tv size={13} /> : <Film size={13} />}
                  {media.media_type === 'tv' ? 'Series' : 'Movie'}
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <Star size={13} fill="currentColor" />
                  {media.vote_average?.toFixed(1)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/20 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Genres */}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {genres.map(genre => (
                <span
                  key={genre}
                  className="px-3 py-1 bg-white/10 rounded-full text-xs text-zinc-300"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          <p className="text-sm text-zinc-300 leading-relaxed mb-6">
            {media.overview || 'No overview available.'}
          </p>

          {/* TMDB link */}
          <a
            href={tmdbUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
          >
            <ExternalLink size={16} />
            View on TMDB
          </a>
        </div>
      </motion.div>
    </>
  );
};
