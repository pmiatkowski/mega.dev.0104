import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightOnDisk = {
  night: string;
  ok: number | null; // null = the night's file could not be read; the view shows —
  retry: number | null;
  fail: number | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightOnDisk[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// Per job by lastStatus, from the same rows the digest page shows, so board and digest
// cannot disagree. An unreadable night keeps its place with null counts.
function nightOnDisk(runsDir: string, night: string): NightOnDisk {
  try {
    const rows = readNight(runsDir, night).rows;
    const byStatus = (status: 'ok' | 'retry' | 'fail') =>
      rows.filter((r) => r.lastStatus === status).length;
    return { night, ok: byStatus('ok'), retry: byStatus('retry'), fail: byStatus('fail') };
  } catch {
    return { night, ok: null, retry: null, fail: null };
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => nightOnDisk(config.runsDir, night)),
  };
}
