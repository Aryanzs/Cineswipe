import { Media, Interaction } from '../types';
import { getImageUrl } from '../services/tmdb';
import { motion } from 'motion/react';
import { Tv, Film, Star, Trash2, Info, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface MyListProps {
  mediaList: Media[];
  interactions: Interaction[];
  onRemove: (interactionId: string) => void;
  onInfo: (media: Media) => void;
}

export const MyList = ({ mediaList, interactions, onRemove, onInfo }: MyListProps) => {
  const handleShare = async () => {
    try {
      await navigator.share({
        title: 'My CineSwipe Watchlist',
        text: `Check out my movie watchlist on CineSwipe! ${mediaList.length} titles saved.`,
        url: window.location.href,
      });
    } catch {
      // Fallback: copy link
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    }
  };

  if (mediaList.length === 0) {
    return (
      <div className="text-center text-zinc-500 mt-20 px-6">
        <p>No matches found in your list.</p>
        <p className="text-sm mt-2">Try changing your filters or swipe right on more titles.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Share button */}
      <div className="px-6 mb-3 flex justify-end">
        <button
          onClick={handleShare}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <Share2 size={14} />
          Share list
        </button>
      </div>

      <div className="overflow-y-auto pb-32 px-2 no-scrollbar">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {mediaList.map((media, i) => {
            const title = media.title || media.name;
            const date = media.release_date || media.first_air_date;
            const year = date ? date.split('-')[0] : '';
            const interaction = interactions.find(inter => inter.media_data.id === media.id);

            return (
              <motion.div
                key={media.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                className="relative aspect-[2/3] rounded-2xl overflow-hidden group bg-zinc-900 border border-white/5"
              >
                <img
                  src={getImageUrl(media.poster_path, 'w500')}
                  alt={title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500x750/18181b/ffffff?text=No+Poster';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Media type badge */}
                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] uppercase tracking-widest font-bold flex items-center gap-1">
                    {media.media_type === 'tv' ? <Tv size={10} /> : <Film size={10} />}
                    {media.media_type === 'tv' ? 'Series' : 'Movie'}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <button
                    onClick={() => onInfo(media)}
                    className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
                    aria-label="More info"
                  >
                    <Info size={14} />
                  </button>
                  {interaction && (
                    <button
                      onClick={() => onRemove(interaction.id)}
                      className="w-8 h-8 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white hover:bg-rose-500 transition-colors"
                      aria-label="Remove from watchlist"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Title info */}
                <div className="absolute bottom-0 left-0 w-full p-3 translate-y-4 group-hover:translate-y-0 transition-transform duration-300 opacity-0 group-hover:opacity-100">
                  <h3 className="text-sm font-bold leading-tight drop-shadow-md line-clamp-2">{title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-zinc-400">{year}</p>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <Star size={10} fill="currentColor" />
                      {media.vote_average?.toFixed(1)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
