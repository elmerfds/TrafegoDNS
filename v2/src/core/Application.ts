/**
 * Main Application Orchestrator
 * Coordinates startup, shutdown, and service lifecycle
 */
import { logger } from './Logger.js';
import { eventBus, EventTypes } from './EventBus.js';
import { container, ServiceTokens } from './ServiceContainer.js';
import { ConfigManager, getConfig } from '../config/ConfigManager.js';
import { initDatabase, closeDatabase } from '../database/connection.js';
import { DNSManager, WebhookService, TunnelManager, getSettingsService } from '../services/index.js';
import { DockerMonitor, TraefikMonitor, DirectMonitor } from '../monitors/index.js';
import { createApp, startServer } from '../app.js';
import { V1Migrator } from '../migration/V1Migrator.js';
import { ensureAdminUser } from '../api/controllers/authController.js';

export interface ApplicationOptions {
  skipDatabase?: boolean;
  skipApi?: boolean;
  skipMonitors?: boolean;
}

export class Application {
  private config: ConfigManager;
  private isRunning: boolean = false;
  private shutdownPromise: Promise<void> | null = null;
  private dnsManager: DNSManager | null = null;
  private webhookService: WebhookService | null = null;
  private tunnelManager: TunnelManager | null = null;
  private dockerMonitor: DockerMonitor | null = null;
  private traefikMonitor: TraefikMonitor | null = null;
  private directMonitor: DirectMonitor | null = null;

  constructor(private options: ApplicationOptions = {}) {
    this.config = getConfig();

    // Register core services in container
    container.registerInstance(ServiceTokens.CONFIG, this.config);
    container.registerInstance(ServiceTokens.EVENT_BUS, eventBus);
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Application already running');
      return;
    }

    logger.info({ mode: this.config.app.operationMode }, 'Starting TrafegoDNS v2');

    try {
      // Initialize database
      if (!this.options.skipDatabase) {
        await this.initializeDatabase();

        // Run v1 migration if needed
        await this.runMigration();

        // Ensure admin user exists
        await this.ensureAdminUser();
      }

      // Initialize services
      await this.initializeServices();

      // Start API server
      if (!this.options.skipApi) {
        await this.startApiServer();
      }

      // Start monitors
      if (!this.options.skipMonitors) {
        await this.startMonitors();
      }

      // Setup graceful shutdown
      this.setupShutdownHandlers();

      this.isRunning = true;

      // Publish startup event
      eventBus.publish(EventTypes.SYSTEM_STARTED, {
        version: '2.0.0',
        mode: this.config.app.operationMode,
      });

      logger.info('TrafegoDNS v2 started successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to start application');
      throw error;
    }
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
    const dbPath = this.config.app.databasePath;

    if (!dbPath) {
      throw new Error('Database path not configured');
    }

    const db = initDatabase({
      path: dbPath,
      runMigrations: true,
      verbose: this.config.app.logLevel === 'trace',
    });

    container.registerInstance(ServiceTokens.DATABASE, db);
    logger.info({ path: dbPath }, 'Database initialized');
  }

  /**
   * Run v1 to v2 migration if needed
   */
  private async runMigration(): Promise<void> {
    // Derive config path from data dir (parent directory)
    const configPath = this.config.app.dataDir.replace(/\/data$/, '');
    const migrator = new V1Migrator(configPath);

    if (migrator.hasV1Data()) {
      logger.info('Found v1 data, running migration...');
      const result = await migrator.migrate();

      if (result.success) {
        logger.info({ message: result.message }, 'Migration completed');
      } else {
        logger.error({ message: result.message }, 'Migration failed');
      }
    }
  }

  /**
   * Ensure admin user exists (creates from env vars if not)
   */
  private async ensureAdminUser(): Promise<void> {
    const { defaultAdminUsername, defaultAdminPassword, defaultAdminEmail } = this.config.auth;
    await ensureAdminUser(defaultAdminUsername, defaultAdminPassword, defaultAdminEmail);
    logger.debug('Admin user check completed');
  }

  /**
   * Initialize application services
   */
  private async initializeServices(): Promise<void> {
    // Initialize Settings Service first (loads settings from database)
    const settingsService = getSettingsService();
    await settingsService.init();
    container.registerInstance(ServiceTokens.SETTINGS_SERVICE, settingsService);

    // Start IP refresh
    this.config.startIPRefresh();
    await this.config.updatePublicIPs();

    // Initialize DNS Manager
    this.dnsManager = new DNSManager(this.config);
    await this.dnsManager.init();
    container.registerInstance(ServiceTokens.DNS_MANAGER, this.dnsManager);

    // Initialize Webhook Service
    this.webhookService = new WebhookService({
      maxRetries: this.config.app.webhookRetryAttempts,
      retryDelay: this.config.app.webhookRetryDelay,
    });
    await this.webhookService.init();
    container.registerInstance(ServiceTokens.WEBHOOK_SERVICE, this.webhookService);

    // Initialize Docker Monitor
    this.dockerMonitor = new DockerMonitor(this.config);
    await this.dockerMonitor.init();
    container.registerInstance(ServiceTokens.DOCKER_MONITOR, this.dockerMonitor);

    // Initialize Tunnel Manager (optional - only if Cloudflare provider with accountId is configured)
    this.tunnelManager = new TunnelManager(this.config);
    await this.tunnelManager.init();
    container.registerInstance(ServiceTokens.TUNNEL_MANAGER, this.tunnelManager);

    logger.debug('Services initialized');
  }

  /**
   * Start the API server
   */
  private async startApiServer(): Promise<void> {
    const app = createApp({ trustProxy: true });
    await startServer(app);
  }

  /**
   * Start monitors based on operation mode
   */
  private async startMonitors(): Promise<void> {
    if (!this.dockerMonitor) {
      throw new Error('Docker monitor not initialized');
    }

    // Start Docker event watching
    if (this.config.docker.watchEvents) {
      await this.dockerMonitor.startWatching();
    }

    // Choose monitor based on operation mode
    if (this.config.app.operationMode === 'traefik') {
      this.traefikMonitor = new TraefikMonitor(this.config, this.dockerMonitor);
      await this.traefikMonitor.init();
      this.traefikMonitor.startPolling();
      container.registerInstance(ServiceTokens.TRAEFIK_MONITOR, this.traefikMonitor);
      logger.info('Traefik monitor started');
    } else {
      this.directMonitor = new DirectMonitor(this.config, this.dockerMonitor);
      await this.directMonitor.init();
      this.directMonitor.startPolling();
      container.registerInstance(ServiceTokens.DIRECT_MONITOR, this.directMonitor);
      logger.info('Direct monitor started');
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string): Promise<void> => {
      if (this.shutdownPromise) {
        logger.info('Shutdown already in progress');
        return this.shutdownPromise;
      }

      logger.info({ signal }, 'Shutdown signal received');
      this.shutdownPromise = this.shutdown(signal);
      await this.shutdownPromise;
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      void shutdown('uncaughtException').then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection');
      void shutdown('unhandledRejection').then(() => process.exit(1));
    });
  }

  /**
   * Shutdown the application
   */
  async shutdown(reason: string = 'manual'): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info({ reason }, 'Shutting down TrafegoDNS');

    // Publish shutdown event
    eventBus.publish(EventTypes.SYSTEM_SHUTDOWN, { reason });

    try {
      // Stop monitors
      if (this.traefikMonitor) {
        await this.traefikMonitor.dispose();
      }
      if (this.directMonitor) {
        await this.directMonitor.dispose();
      }
      if (this.dockerMonitor) {
        await this.dockerMonitor.dispose();
      }

      // Dispose services
      if (this.tunnelManager) {
        await this.tunnelManager.dispose();
      }
      if (this.webhookService) {
        await this.webhookService.dispose();
      }
      if (this.dnsManager) {
        await this.dnsManager.dispose();
      }

      // Close database
      closeDatabase();

      // Clear container
      container.clear();

      this.isRunning = false;
      logger.info('TrafegoDNS shutdown complete');
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      throw error;
    }
  }

  /**
   * Check if application is running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

// Export factory function
export function createApplication(options?: ApplicationOptions): Application {
  return new Application(options);
}
