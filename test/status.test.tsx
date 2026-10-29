import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('links the nights on disk to their digest with per-job counts', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toContain('ok 4 · retry 0 · fail 1');
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('ok 4 · retry 0 · fail 0');
  });

  it('keeps an unreadable night on the board with — counts', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-board-'));
    // A directory where the night's file should be: listed by readdir, unreadable as a file.
    mkdirSync(join(runsDir, '2026-10-26.jsonl'));
    try {
      const res = await createApp({ ...config, runsDir }).request('/');
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('href="/digest/2026-10-26"');
      expect(html).toContain('ok — · retry — · fail —');
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
