/**
 * Express Application Setup
 */
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { logger } from './core/Logger.js';
import { getConfig } from './config/ConfigManager.js';
import { apiRouter, errorHandler, notFoundHandler } from './api/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AppOptions {
  trustProxy?: boolean;
}

/**
 * Create and configure the Express application
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const config = getConfig();

  // Trust proxy for correct client IP detection
  if (options.trustProxy) {
    app.set('trust proxy', true);
  }

  // Security middleware with proper CSP for SPA
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Required for some SPA frameworks
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // Required for some external resources
  }));

  // CORS - secure configuration
  // Default to same-origin only; must explicitly configure CORS_ORIGIN for cross-origin access
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors({
    origin: corsOrigin ? corsOrigin.split(',').map(o => o.trim()) : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    maxAge: 86400, // 24 hours preflight cache
  }));

  // Cookie parser
  app.use(cookieParser());

  // JSON body parser
  app.use(express.json({ limit: '10mb' }));

  // URL encoded body parser
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({
      method: req.method,
      url: req.url,
      ip: req.ip,
    }, 'Request received');
    next();
  });

  // Basic health check (outside versioned API)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '2.0.0',
      mode: config.app.operationMode,
      timestamp: new Date().toISOString(),
    });
  });

  // API v1 routes
  app.use('/api/v1', apiRouter);

  // Serve Web UI static files in production
  const webDistPath = join(__dirname, '../web/dist');
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));

    // SPA fallback - serve index.html for non-API routes
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      // Skip API routes
      if (req.path.startsWith('/api/') || req.path === '/health') {
        return next();
      }
      res.sendFile(join(webDistPath, 'index.html'));
    });
  }

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

/**
 * Start the Express server
 */
export function startServer(app: Express): Promise<void> {
  const config = getConfig();
  const { apiPort, apiHost } = config.app;

  return new Promise((resolve, reject) => {
    try {
      const server = app.listen(apiPort, apiHost, () => {
        logger.info({ host: apiHost, port: apiPort }, 'API server started');
        resolve();
      });

      server.on('error', (error) => {
        logger.error({ error }, 'API server error');
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}
