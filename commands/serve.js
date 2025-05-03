import path from 'path';
import chokidar from 'chokidar';
import { setupServer, startServer, shutdownServer } from '../lib/server-manager.js';

/**
 * Start a development server for the standalone agent
 * @param {object} options - Options for the server
 * @param {number} options.port - Port to run the server on
 * @param {boolean} options.liveReload - Whether to enable live reload
 * @returns {Promise<void>}
 */
export default async function serve(options = {}) {
  const port = options.port || 8000;
  const liveReload = options.liveReload !== false;
  
  // Setup server
  const serverInfo = await setupServer({ port });
  
  // Start server
  const { serverProcess, shutdownKey, serverUrl } = await startServer(serverInfo);
  
  // Setup live reload if enabled
  let watcher;
  if (liveReload) {
    console.log('Setting up live reload...');
    watcher = chokidar.watch([
      path.join(serverInfo.tmpDir, 'src/**/*'),
      path.join(serverInfo.tmpDir, 'config.json')
    ], {
      ignored: /(^|[\/\\])\../,
      persistent: true
    });

    watcher.on('change', async (path) => {
      console.log(`File ${path} has changed. Restarting server...`);
      
      // Shutdown current server
      await shutdownServer({ serverUrl, shutdownKey, serverProcess });
      
      // Start new server
      const newServerInfo = await startServer(serverInfo);
      Object.assign(serverInfo, newServerInfo);
    });
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    if (watcher) {
      await watcher.close();
    }
    await shutdownServer({ serverUrl, shutdownKey, serverProcess });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}