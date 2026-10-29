// Plan morning-digest § 1: the contract every digest part reads a night through.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in runs/<night>.jsonl. Times keep the log's offset exactly as written.
export type DigestRow = {
  job: string;
  owner: string | null; // a null owner stays null; the view renders it as —
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null; // the newest run that carried an error, null if none did
  firstAt: string;
  lastAt: string;
};

export type ReadNightResult = {
  rows: DigestRow[]; // sorted by job, so the page and the JSON cannot disagree on order
  badLines: number; // lines that didn't parse, counted — never thrown
};

// Reads runs/<night>.jsonl. Throws only when night isn't YYYY-MM-DD or the file is
// missing; an empty file is { rows: [], badLines: 0 }, so a caller can tell the two
// apart.
export type ReadNight = (runsDir: string, night: string) => ReadNightResult;
