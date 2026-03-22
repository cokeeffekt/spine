export interface FfprobeOutput {
  format: {
    duration: string;
    size: string;
    tags: Record<string, string | undefined>;
  };
  streams: Array<{
    codec_type: string;
    codec_name?: string;
    disposition?: { attached_pic: number };
  }>;
  chapters: Array<{
    id: number;
    time_base: string;
    start: number;
    start_time: string;
    end: number;
    end_time: string;
    tags: { title?: string };
  }>;
}

export interface Book {
  id: number;
  file_path: string;
  file_mtime: number;
  file_size: number;
  is_missing: number;
  title: string | null;
  author: string | null;
  narrator: string | null;
  series_title: string | null;
  series_position: string | null;
  description: string | null;
  genre: string | null;
  publisher: string | null;
  year: string | null;
  language: string | null;
  duration_sec: number | null;
  codec: string | null;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: number;
  book_id: number;
  chapter_idx: number;
  title: string | null;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export interface NormalizedChapter {
  chapter_idx: number;
  title: string | null;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface Session {
  token: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface NormalizedMetadata {
  title: string | null;
  author: string | null;
  narrator: string | null;
  series_title: string | null;
  series_position: string | null;
  description: string | null;
  genre: string | null;
  publisher: string | null;
  year: string | null;
  language: string | null;
  duration_sec: number | null;
  codec: string | null;
  has_cover_stream: boolean;
  chapters: NormalizedChapter[];
}
