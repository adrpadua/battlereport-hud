export interface ProgressStep {
  message: string;
  delay: number; // milliseconds from start of phase
}

export const FETCH_PROGRESS_STEPS: ProgressStep[] = [
  { message: 'Connecting to YouTube...', delay: 0 },
  { message: 'Fetching video metadata...', delay: 500 },
  { message: 'Extracting transcript...', delay: 1500 },
  { message: 'Processing chapter markers...', delay: 2500 },
  { message: 'Detecting factions...', delay: 3500 },
];

export const EXTRACT_PROGRESS_STEPS: ProgressStep[] = [
  { message: 'Building prompt with faction data...', delay: 0 },
  { message: 'Sending to AI for extraction...', delay: 500 },
  { message: 'AI is analyzing the transcript (this may take 1-2 minutes)...', delay: 2000 },
];
