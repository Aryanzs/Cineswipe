import { Media } from '../types';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

const fetchFromTMDB = async (endpoint: string, params: Record<string, string> = {}) => {
  if (!API_KEY) throw new Error('TMDB API Key is missing');
  
  const queryParams = new URLSearchParams({
    api_key: API_KEY,
    ...params,
  });
  
  const response = await fetch(`${BASE_URL}${endpoint}?${queryParams}`);
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }
  return response.json();
};

export const getDiscoverMedia = async (
  type: 'movie' | 'tv',
  page = 1,
  providerId?: number | null,
  extraParams: Record<string, string> = {}
): Promise<Media[]> => {
  const params: Record<string, string> = {
    page: page.toString(),
    sort_by: 'popularity.desc',
    watch_region: 'IN',
    ...extraParams,  // allows overriding sort_by, adding vote_count.gte, etc.
  };

  if (providerId) {
    params.with_watch_providers = providerId.toString();
  }

  const data = await fetchFromTMDB(`/discover/${type}`, params);
  return data.results.map((item: any) => ({
    ...item,
    media_type: type,
    provider_id: providerId ?? null,
  }));
};

export const getRecommendations = async (mediaId: number, type: 'movie' | 'tv'): Promise<Media[]> => {
  const data = await fetchFromTMDB(`/${type}/${mediaId}/recommendations`);
  return data.results.map((item: any) => ({ ...item, media_type: type }));
};

export const getImageUrl = (path: string | null, size: 'w500' | 'original' = 'w500') => {
  if (!path) return 'https://via.placeholder.com/500x750/18181b/ffffff?text=No+Poster';
  return `https://image.tmdb.org/t/p/${size}${path}`;
};
