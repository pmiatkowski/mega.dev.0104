import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

// runs/ is a read-only fixture: only the fixture test reads it directly, everything
// else writes its night into a temp dir.
function withRuns(lines: string[], fn: (runsDir: string) => void): void {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), lines.length > 0 ? `${lines.join('\n')}\n` : '');
  try {
    fn(runsDir);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
}

describe('readNight', () => {
  it('reads the fixture night into one sorted row per job', () => {
    expect(readNight('runs', '2026-10-28')).toEqual({
      badLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('counts lines that do not parse instead of throwing', () => {
    withRuns(['not json', '{"at":"2026-10-28T23:00:00Z","job":"j","status":"ok"}'], (runsDir) => {
      expect(readNight(runsDir, '2026-10-28')).toEqual({ badLines: 2, rows: [] });
    });
  });

  it('tells a missing night and a bad name from an empty one', () => {
    withRuns([], (runsDir) => {
      expect(readNight(runsDir, '2026-10-28')).toEqual({ badLines: 0, rows: [] });
      expect(() => readNight(runsDir, '1999-01-01')).toThrow();
      expect(() => readNight(runsDir, '../nope')).toThrow();
    });
  });

  it('keeps the log offset and a null owner', () => {
    withRuns(
      ['{"at":"2026-10-28T23:00:01+05:30","job":"a/job","status":"fail","owner":null,"error":"boom"}'],
      (runsDir) => {
        expect(readNight(runsDir, '2026-10-28').rows).toEqual([
          {
            job: 'a/job',
            owner: null,
            runs: 1,
            retries: 0,
            lastStatus: 'fail',
            lastError: 'boom',
            firstAt: '2026-10-28T23:00:01+05:30',
            lastAt: '2026-10-28T23:00:01+05:30',
          },
        ]);
      },
    );
  });
});
