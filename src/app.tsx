import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/read-night.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
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
