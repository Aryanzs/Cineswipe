import { motion, useMotionValue, useTransform, useAnimation } from 'motion/react';
import { Media } from '../types';
import { getImageUrl } from '../services/tmdb';
import React, { useEffect } from 'react';
import { Tv, Film, Star, Info } from 'lucide-react';

interface SwipeCardProps {
  key?: React.Key;
  media: Media;
  onSwipe: (direction: 'left' | 'right', media: Media) => void;
  onInfo: (media: Media) => void;
  isTop: boolean;
  index: number;
}

export const SwipeCard = ({ media, onSwipe, onInfo, isTop, index }: SwipeCardProps) => {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);

  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [0, -100], [0, 1]);

  const controls = useAnimation();

  useEffect(() => {
    if (isTop) {
      controls.start({ x: 0, y: 0, rotate: 0 });
    }
  }, [isTop, controls]);

  const handleDragEnd = async (_event: unknown, info: { offset: { x: number } }) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      await controls.start({ x: 500, opacity: 0, transition: { duration: 0.2 } });
      onSwipe('right', media);
    } else if (info.offset.x < -threshold) {
      await controls.start({ x: -500, opacity: 0, transition: { duration: 0.2 } });
      onSwipe('left', media);
    } else {
      controls.start({ x: 0, y: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
    }
  };

  const scale = isTop ? 1 : 1 - index * 0.05;
  const yOffset = isTop ? 0 : index * 15;

  const title = media.title || media.name;
  const date = media.release_date || media.first_air_date;
  const year = date ? date.split('-')[0] : 'Unknown';

  return (
    <motion.div
      className="absolute w-full h-full origin-bottom"
      initial={{ scale: 0.9, y: 50, opacity: 0 }}
      animate={{ scale, y: yOffset, opacity: 1, zIndex: 10 - index }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Info button lives OUTSIDE overflow-hidden so it's never clipped */}
      {isTop && (
        <button
          onClick={() => onInfo(media)}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-white hover:bg-black/90 transition-colors z-20 border border-white/10"
          aria-label="More info"
        >
          <Info size={18} />
        </button>
      )}

      <motion.div
        className="w-full h-full rounded-4xl shadow-2xl overflow-hidden bg-zinc-900 border border-white/10 relative"
        style={{ x, rotate }}
        animate={controls}
        drag={isTop ? 'x' : false}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onDragEnd={handleDragEnd}
        whileTap={isTop ? { cursor: 'grabbing' } : {}}
      >
        <img
          src={getImageUrl(media.poster_path, 'w500')}
          alt={title}
          loading={index === 0 ? 'eager' : 'lazy'}
          className="w-full h-full object-cover pointer-events-none"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500x750/18181b/ffffff?text=No+Poster';
          }}
        />
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/60 to-transparent pointer-events-none" />

        <div className="absolute bottom-0 left-0 w-full p-8 text-white pointer-events-none flex flex-col justify-end h-full">
          <div className="mt-auto">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-white/20 backdrop-blur-md px-2 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold flex items-center gap-1">
                {media.media_type === 'tv' ? <Tv size={12} /> : <Film size={12} />}
                {media.media_type === 'tv' ? 'Series' : 'Movie'}
              </span>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold flex items-center gap-1">
                <Star size={12} fill="currentColor" />
                {media.vote_average?.toFixed(1)}
              </span>
            </div>

            <h2 className="text-3xl font-display leading-tight mb-1 drop-shadow-lg">{title}</h2>

            <div className="flex items-center gap-3 text-xs text-zinc-300 mb-4 font-sans uppercase tracking-wider">
              <span>{year}</span>
            </div>

            <p className="text-sm text-zinc-300 line-clamp-4 leading-relaxed font-sans drop-shadow-md">
              {media.overview || 'No overview available.'}
            </p>
          </div>
        </div>

        {/* Swipe Indicators */}
        <motion.div
          className="absolute top-12 left-8 border-4 border-emerald-500 text-emerald-500 rounded-xl px-6 py-2 text-4xl font-black uppercase tracking-widest -rotate-15 bg-black/40 backdrop-blur-md shadow-[0_0_30px_rgba(16,185,129,0.3)]"
          style={{ opacity: likeOpacity }}
          aria-hidden="true"
        >
          LIKE
        </motion.div>
        <motion.div
          className="absolute top-12 right-8 border-4 border-rose-500 text-rose-500 rounded-xl px-6 py-2 text-4xl font-black uppercase tracking-widest rotate-15 bg-black/40 backdrop-blur-md shadow-[0_0_30px_rgba(244,63,94,0.3)]"
          style={{ opacity: nopeOpacity }}
          aria-hidden="true"
        >
          NOPE
        </motion.div>
      </motion.div>
    </motion.div>
  );
};
