import { buildApp } from './app.js';
import { CONFIG } from './config.js';
import { db } from './db.js';
import process from 'node:process';

const start = async () => {
  try {
    const app = await buildApp();

    await app.listen({ port: CONFIG.PORT, host: CONFIG.ADDRESS });
    console.log(`Server is running on http://${CONFIG.ADDRESS}:${CONFIG.PORT}`);
    console.log(`API docs available at http://${CONFIG.ADDRESS}:${CONFIG.PORT}/docs`);

    // Handle termination signals for graceful shutdown
    const shutdown = async (signal: NodeJS.Signals) => {
      console.log(`Received ${signal}. Closing server...`);
      try {
        await app.close();
        await db.destroy();
        console.log('Server closed successfully.');
        process.exit(0);
      } catch (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();