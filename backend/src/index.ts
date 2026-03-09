import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import todosRouter from './routes/todos';

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

app.listen(PORT, () => {
  console.log(`[backend] Server running on http://localhost:${PORT}`);
});
