export interface Media {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  media_type: 'movie' | 'tv';
  provider_id?: number | null;
}

export interface Interaction {
  id: number;
  user_id: number;
  media_id: number;
  media_type: 'movie' | 'tv';
  interaction_type: 'like' | 'reject';
  media_data: Media;
  created_at: string;
}

export interface ApiError {
  error: string;
}
