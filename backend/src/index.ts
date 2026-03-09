import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import todosRouter, { setBroadcast } from './routes/todos';

const app = express();
const PORT = process.env['PORT'] ?? 3000;
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:4200';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.use('/api/todos', todosRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the Angular frontend when built into the image (production)
const staticDir = path.join(__dirname, '../public');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  console.log(`[ws] client connected — total: ${wss.clients.size}`);
  ws.on('close', () => console.log(`[ws] client disconnected — total: ${wss.clients.size}`));
});

function broadcast(event: string, payload: unknown): void {
  const msg = JSON.stringify({ event, payload });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

setBroadcast(broadcast);

server.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`);
});
