import { createServer } from 'node:http';
import { requestHandler } from './app.js';

const preferredPort = Number(process.env.PORT || 3001);
const server = createServer((req, res) => {
  requestHandler(req, res).catch((error) => {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
  });
});

function listenWithFallback(port, attemptsLeft = 10) {
  server.listen(port, () => {
    console.log(`Valtrim API running on http://localhost:${port}`);
  });

  server.once('error', (error) => {
    const isPortInUse = error && typeof error === 'object' && error.code === 'EADDRINUSE';
    if (!isPortInUse || attemptsLeft <= 0) {
      throw error;
    }

    const nextPort = port + 1;
    console.warn(`Port ${port} is in use, retrying on ${nextPort}...`);
    listenWithFallback(nextPort, attemptsLeft - 1);
  });
}

listenWithFallback(preferredPort);

