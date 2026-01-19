export interface VideoData {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  chapters: Chapter[];
  transcript: TranscriptSegment[];
  pinnedComment: string | null;
}

export interface Chapter {
  title: string;
  startTime: number; // seconds
}

export interface TranscriptSegment {
  text: string;
  startTime: number; // seconds
  duration: number;
}
