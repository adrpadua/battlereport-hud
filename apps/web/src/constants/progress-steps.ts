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
  { message: 'Preparing extraction...', delay: 0 },
  { message: 'Preprocessing transcript...', delay: 300 },
  { message: 'Initializing AI model...', delay: 800 },
  { message: 'Analyzing battle report content...', delay: 1500 },
  { message: 'Identifying units and wargear...', delay: 4000 },
  { message: 'Detecting stratagems used...', delay: 7000 },
  { message: 'Validating extracted data...', delay: 10000 },
];
