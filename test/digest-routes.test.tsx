import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

// runs/ is a read-only fixture: every night here is written into a temp dir instead.
async function withRuns(lines: string[], fn: (runsDir: string) => Promise<void>): Promise<void> {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), lines.length > 0 ? `${lines.join('\n')}\n` : '');
  try {
    await fn(runsDir);
  } finally {
    rmSync(runsDir, { recursive: true, force: true });
  }
}

// Log order is deliberately unsorted: the rows come out sorted by job.
const night = [
  '{"at":"2026-10-28T23:00:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T23:01:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook"}',
  '{"at":"2026-10-28T23:02:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook"}',
  '{"at":"2026-10-28T23:03:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T23:10:00+01:00","job":"digest/render","status":"ok","owner":null}',
  '{"at":"2026-10-28T23:20:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
];

const expectedRows: DigestRow[] = [
  {
    job: 'digest/render',
    owner: null,
    runs: 1,
    retries: 0,
    lastStatus: 'ok',
    lastError: null,
    firstAt: '2026-10-28T23:10:00+01:00',
    lastAt: '2026-10-28T23:10:00+01:00',
  },
  {
    job: 'fixtures/refresh',
    owner: 'rook',
    runs: 4,
    retries: 3,
    lastStatus: 'ok',
    lastError: 'upstream 503',
    firstAt: '2026-10-28T23:00:00+01:00',
    lastAt: '2026-10-28T23:03:00+01:00',
  },
  {
    job: 'notes/backup',
    owner: 'lane-07',
    runs: 1,
    retries: 0,
    lastStatus: 'fail',
    lastError: 'quota exceeded',
    firstAt: '2026-10-28T23:20:00+01:00',
    lastAt: '2026-10-28T23:20:00+01:00',
  },
];

describe('GET /digest/:night', () => {
  it('renders the night as one table, with — for nulls and warn on the cells worth reading', async () => {
    await withRuns(night, async (runsDir) => {
      const res = await createApp({ ...config, runsDir }).request('/digest/2026-10-28');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('<h1>digest · 2026-10-28</h1>');
      expect(html).toContain('<td>digest/render</td>');
      expect(html).toContain('<td>—</td>');
      expect(html).toContain('<td class="warn">3</td>');
      expect(html).toContain('<td class="warn">fail</td>');
      expect(html).toContain('quota exceeded');
      expect(html).toContain('upstream 503');
    });
  });

  it('404s a night with no file, and a name that is not a night', async () => {
    await withRuns(night, async (runsDir) => {
      const app = createApp({ ...config, runsDir });
      const missing = await app.request('/digest/1999-01-01');
      expect(missing.status).toBe(404);
      expect(await missing.text()).toBe('no such night');
      const badName = await app.request('/digest/yesterday');
      expect(badName.status).toBe(404);
      expect(await badName.text()).toBe('no such night');
    });
  });

  it('renders an empty night as nothing ran, with no table', async () => {
    await withRuns([], async (runsDir) => {
      const res = await createApp({ ...config, runsDir }).request('/digest/2026-10-28');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('<p class="mute">nothing ran</p>');
      expect(html).not.toContain('<table');
    });
  });

  it('still renders the good rows of a night whose log has a bad line', async () => {
    await withRuns(
      [
        'this line is not json',
        '{"at":"2026-10-28T23:10:00+01:00","job":"digest/render","status":"ok","owner":null}',
        '{"at":"2026-10-28T23:20:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
      ],
      async (runsDir) => {
        const res = await createApp({ ...config, runsDir }).request('/digest/2026-10-28');
        const html = await res.text();
        expect(res.status).toBe(200);
        expect(html).toContain('<td>digest/render</td>');
        expect(html).toContain('<td>notes/backup</td>');
        expect(html).not.toContain('nothing ran');
      },
    );
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the bare rows array, sorted by job', async () => {
    await withRuns(night, async (runsDir) => {
      const res = await createApp({ ...config, runsDir }).request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);
      expect((await res.json()) as DigestRow[]).toEqual(expectedRows);
    });
  });

  it('404s with a JSON error for a night with no file, and a name that is not a night', async () => {
    await withRuns(night, async (runsDir) => {
      const app = createApp({ ...config, runsDir });
      const missing = await app.request('/api/digest/1999-01-01');
      expect(missing.status).toBe(404);
      expect(missing.headers.get('content-type')).toContain('application/json');
      expect(await missing.json()).toEqual({ error: 'no such night: 1999-01-01' });
      const badName = await app.request('/api/digest/yesterday');
      expect(badName.status).toBe(404);
      expect(await badName.json()).toEqual({ error: 'no such night: yesterday' });
    });
  });

  it('returns [] for an empty night', async () => {
    await withRuns([], async (runsDir) => {
      const res = await createApp({ ...config, runsDir }).request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  it('still returns the good rows of a night whose log has a bad line', async () => {
    await withRuns(
      [
        'this line is not json',
        '{"at":"2026-10-28T23:10:00+01:00","job":"digest/render","status":"ok","owner":null}',
        '{"at":"2026-10-28T23:20:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
      ],
      async (runsDir) => {
        const res = await createApp({ ...config, runsDir }).request('/api/digest/2026-10-28');
        expect(res.status).toBe(200);
        expect((await res.json()) as DigestRow[]).toEqual([expectedRows[0], expectedRows[2]]);
      },
    );
  });
});

describe('digest page and JSON parity', () => {
  it('serves the same jobs in the same order on both (ADR 0001)', async () => {
    await withRuns(night, async (runsDir) => {
      const app = createApp({ ...config, runsDir });
      const rows = (await (await app.request('/api/digest/2026-10-28')).json()) as DigestRow[];
      const jobs = rows.map((row) => row.job);
      expect(jobs).toEqual([...jobs].sort());
      const html = await (await app.request('/digest/2026-10-28')).text();
      let at = html.indexOf('<tbody>');
      for (const job of jobs) {
        const next = html.indexOf(`<td>${job}</td>`, at + 1);
        expect(next).toBeGreaterThan(at);
        at = next;
      }
    });
  });
});
