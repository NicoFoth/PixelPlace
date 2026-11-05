import { DataDirError, createApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';
import { CanvasTooSmallError } from './store.ts';

try {
  const config = loadConfig();
  const app = createApp(config);
  const port = await app.start();

  console.log(`PixelPlace server listening on port ${port}`);
  console.log(`  canvas:   ${config.width}x${config.height}`);
  console.log(`  cooldown: ${config.cooldownMs / 1000}s per IP${config.trustProxy ? ' (X-Forwarded-For trusted)' : ''}`);
  console.log(`  data:     ${config.dataDir}`);
  console.log(`  website:  ${config.clientDir ?? 'none (no client build found; WebSocket only)'}`);

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    console.log(`${signal} received, shutting down...`);
    app.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
} catch (error) {
  if (error instanceof ConfigError || error instanceof CanvasTooSmallError || error instanceof DataDirError) {
    console.error(`Configuration error: ${error.message}`);
    process.exit(1);
  }
  if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
    console.error(`Port is already in use. Set PORT to a free port. (${error.message})`);
    process.exit(1);
  }
  throw error;
}
