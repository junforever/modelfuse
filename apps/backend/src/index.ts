import { createApp, gracefulShutdown } from './app.js';

const port = process.env.PORT ?? 3001;
if (process.env.NODE_ENV !== 'test') {
  const app = createApp();

  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT')); // Ctrl + C local
  process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM')); // production (Railway, Docker, etc.)
}
