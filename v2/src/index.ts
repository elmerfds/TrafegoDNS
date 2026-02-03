/**
 * TrafegoDNS v2 - Entry Point
 *
 * Automatic DNS management for Docker containers
 * with support for multiple DNS providers and Cloudflare Tunnels
 */
import { createApplication, logger } from './core/index.js';

async function main(): Promise<void> {
  logger.info('TrafegoDNS v2 starting...');

  const app = createApplication();

  try {
    await app.start();
  } catch (error) {
    logger.fatal({ error }, 'Failed to start TrafegoDNS');
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
