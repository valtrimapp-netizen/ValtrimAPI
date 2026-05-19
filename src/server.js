import { app } from './app.js';
import { verifyDatabaseAtStartup } from './config/database.js';
import { env } from './config/env.js';

function listenWithFallback(port, attemptsLeft = 10) {
  const server = app.listen(port, () => {
    console.log(`Valtrim API running on http://localhost:${port}`);
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use, retrying on ${nextPort}...`);
      listenWithFallback(nextPort, attemptsLeft - 1);
    } else {
      throw error;
    }
  });
}

await verifyDatabaseAtStartup();
listenWithFallback(env.port);

