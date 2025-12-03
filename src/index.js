#!/usr/bin/env node

import http from 'http';
import url from 'url';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveFile } from './file-handler.js';
import { AdminServer, AdminConfig } from './admin.js';
import { ConfigReader } from './config-reader.js';

/**
 * Main server configuration using the shared ConfigReader
 */
class Config extends ConfigReader {
  constructor() {
    super({
      prefix: '',
      configFileName: 'config.json',
      envPrefix: '',
      defaults: {
        port: 8080,
        basePath: process.cwd(),
        host: '0.0.0.0'
      }
    });
  }

  /**
   * Load environment variables specific to the main server
   */
  loadFromEnv() {
    const envMapping = {
      'PORT': { key: 'port', type: 'number' },
      'BASE_PATH': { key: 'basePath', type: 'string' },
      'HOST': { key: 'host', type: 'string' }
    };
    this.parseEnv(envMapping);
  }

  /**
   * Load command line arguments specific to the main server
   */
  loadFromArgs() {
    const argMapping = {
      '--port': { key: 'port', type: 'number' },
      '-p': { key: 'port', type: 'number' },
      '--base-path': { key: 'basePath', type: 'string' },
      '-b': { key: 'basePath', type: 'string' },
      '--host': { key: 'host', type: 'string' },
      '-h': { key: 'host', type: 'string' },
      '--help': { key: '_help', type: 'boolean' }
    };
    
    this.parseArgs(argMapping);
    
    if (this.get('_help')) {
      this.showHelp();
      process.exit(0);
    }
  }

  showHelp() {
    console.log(`
MD Handler HTTP Server

Usage: node index.js [options]

Options:
  --port, -p <port>        Server port (default: 8080)
  --base-path, -b <path>   Base directory to serve files from (default: current directory)
  --host, -h <host>        Host to bind to (default: 0.0.0.0)
  --help                   Show this help message

Environment Variables:
  PORT                     Server port
  BASE_PATH                Base directory to serve files from
  HOST                     Host to bind to

Config File:
  Create config.json in the same directory with:
  {
    "port": 8080,
    "basePath": "/path/to/serve",
    "host": "0.0.0.0"
  }

Priority: Command line options > Environment variables > Config file > Defaults
    `);
  }
}

/**
 * HTTP Server implementation
 */
class MDServer {
  constructor(config) {
    this.config = config;
    this.server = null;
  }

  async start() {
    this.server = http.createServer(this.handleRequest.bind(this));
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.get('port'), this.config.get('host'), (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`🚀 MD Handler server running at http://${this.config.get('host')}:${this.config.get('port')}`);
          console.log(`📁 Serving files from: ${this.config.get('basePath')}`);
          resolve();
        }
      });
    });
  }

  async handleRequest(req, res) {
    try {
      const startTime = Date.now();
      const parsedUrl = url.parse(req.url, true);
      const requestPath = decodeURIComponent(parsedUrl.pathname);

      // Log the request
      console.log(`${new Date().toISOString()} ${req.method} ${requestPath}`);

      // Only handle GET requests
      if (req.method !== 'GET') {
        this.sendResponse(res, 405, Buffer.from('Method Not Allowed'), 'text/plain');
        return;
      }

      // Handle health check endpoint
      if (requestPath === '/health' || requestPath === '/healthz') {
        this.sendResponse(res, 200, Buffer.from('OK'), 'text/plain');
        return;
      }

      // if the request is for favicon.ico, return 204 No Content
      if (requestPath === '/favicon.ico') {
        this.sendResponse(res, 204, Buffer.alloc(0), 'image/x-icon');
        return;
      }

      console.log('Request path:', requestPath);
      console.log('NODE_ENV:', process.env.NODE_ENV);
      if (process.env.NODE_ENV === 'local') {
        let topPath = '';
        try {
          topPath = requestPath.split('/')[1];
        } catch (e) {}
        console.log('Top path segment:', topPath);
        if (['js', 'public'].includes(topPath)) {
          const innerPort = process.env.INCLUDES_SERVICE_PORT || 80;
          const path = `http://localhost:${innerPort}/${requestPath}`;
          console.log(`Proxying public file request to: ${path}`);
          let data = '';
          http.get(path, (innerRes) => {
            innerRes.on('data', (chunk) => {
              data += chunk;
            });
            innerRes.on('end', () => {
              this.sendResponse(res, 200, Buffer.from(data), innerRes.headers['content-type'] || 'application/octet-stream');
            });
          }).on('error', (err) => {
            console.error('Error fetching include file:', err);
            this.sendResponse(res, 500, Buffer.from('Internal Server Error'), 'text/plain');
          });
          return;
        }
      }

      // Resolve the file using our file handler
      const result = await resolveFile(requestPath, this.config.get('basePath'));
      
      // Send the response
      this.sendResponse(res, result.status, result.buffer, result.contentType);
      
      // Log response time
      const duration = Date.now() - startTime;
      console.log(`${result.status} ${requestPath} (${duration}ms)`);

    } catch (error) {
      console.error('Error handling request:', error);
      this.sendResponse(res, 500, Buffer.from('Internal Server Error'), 'text/plain');
    }
  }

  sendResponse(res, status, buffer, contentType = 'application/octet-stream') {
    res.writeHead(status, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Server': 'MD-Handler/1.0.0',
      'X-Powered-By': 'Node.js'
    });
    res.end(buffer);
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('Server stopped');
          resolve();
        });
      });
    }
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Load configuration
    const configManager = new Config();
    const config = await configManager.load();

    // Validate base path
    try {
      const basePath = configManager.get('basePath');
      const stats = await fs.stat(basePath);
      if (!stats.isDirectory()) {
        throw new Error(`Base path is not a directory: ${basePath}`);
      }
    } catch (error) {
      console.error(`Error: Cannot access base path: ${configManager.get('basePath')}`);
      process.exit(1);
    }

    // Create and start main server
    const server = new MDServer(configManager);
    await server.start();

    // Create and start admin server
    const adminConfigManager = new AdminConfig();
    const adminConfig = await adminConfigManager.load();
    const adminServer = new AdminServer(adminConfig);
    await adminServer.start();

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\nShutting down gracefully...');
      await Promise.all([
        server.stop(),
        adminServer.stop()
      ]);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('Failed to start servers:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MDServer, Config };
