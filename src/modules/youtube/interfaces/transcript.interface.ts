export interface ProcessedTranscript {
  id: number;
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface GeneratedTranscript {
  text: string;
  start: number;
  duration: number;
}
[];

export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  description: string;
  channel: {
    id: string;
    name: string;
  };
  tags: string[];
  likes: number;
  category: string;
  views: number;
}

export interface ProcessedResult {
  info: VideoInfo;
  transcript: {
    original: GeneratedTranscript[];
    custom?: ProcessedTranscript[];
  };
}

export interface TranscriptResponse {
  success: boolean;
  data: ProcessedResult[];
}
