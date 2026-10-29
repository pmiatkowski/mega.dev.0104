import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import type { DigestRow } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestBoard } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    let rows: DigestRow[];
    try {
      rows = readNight(config.runsDir, night).rows;
    } catch {
      return c.text('no such night', 404);
    }
    return c.html(
      <Layout title="digest" lane={lane()}>
        <DigestBoard night={night} rows={rows} />
      </Layout>,
    );
  });

  // The body is the rows array itself, so the JSON and the page cannot disagree (ADR 0001).
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    try {
      return c.json(readNight(config.runsDir, night).rows);
    } catch {
      return c.json({ error: `no such night: ${night}` }, 404);
    }
  });

  return app;
}
