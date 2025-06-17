export interface TranscriptSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  duration: number;
}

export interface ProcessedResult {
  info: any;
  transcript: {
    original: any[];
    processed: TranscriptSegment[];
  };
}

export interface TranscriptResponse {
  success: boolean;
  data: ProcessedResult[];
}
