import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNightResult, RunStatus } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

// A line is good only when it parses into the log's shape; everything else counts as bad.
function parseRun(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { at, job, status, owner, error } = v as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return null;
  if (typeof owner !== 'string' && owner !== null) return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status, owner, error };
}

// The log is append-only, so file order is time order — no parsing or comparing of
// timestamps, their offsets travel through as written.
export function readNight(runsDir: string, night: string): ReadNightResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) throw new Error(`not a night: ${night}`);
  const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const run = parseRun(line);
    if (run === null) {
      badLines++;
      continue;
    }
    const row: DigestRow = byJob.get(run.job) ?? {
      job: run.job,
      owner: run.owner,
      runs: 0,
      retries: 0,
      lastStatus: run.status,
      lastError: null,
      firstAt: run.at,
      lastAt: run.at,
    };
    row.owner = run.owner;
    row.runs++;
    if (run.status === 'retry') row.retries++;
    row.lastStatus = run.status;
    row.lastAt = run.at;
    if (run.error !== undefined) row.lastError = run.error;
    byJob.set(run.job, row);
  }
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
}
