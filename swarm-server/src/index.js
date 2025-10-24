#!/usr/bin/env node

/**
 * Swarm Server Entry Point
 * Starts the server and handles graceful shutdown
 */

const SwarmServer = require('./server');
const logger = require('./utils/logger');

// Get port from environment or default
const PORT = process.env.SWARM_SERVER_PORT || 7777;

// Get idle timeout from environment (in minutes) or default to 30 minutes
const IDLE_TIMEOUT_MINUTES = parseInt(process.env.SWARM_SERVER_IDLE_TIMEOUT) || 30;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

// Auto-shutdown can be disabled with env var
const SHUTDOWN_ON_IDLE = process.env.SWARM_SERVER_SHUTDOWN_ON_IDLE !== 'false';

// Create server instance
const server = new SwarmServer(PORT, {
    idleTimeout: IDLE_TIMEOUT_MS,
    shutdownOnIdle: SHUTDOWN_ON_IDLE
});

/**
 * Graceful shutdown handler
 */
async function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
        await server.stop();
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

/**
 * Start server
 */
async function main() {
    try {
        logger.info('===================================');
        logger.info('   Swarm Server v1.0.0');
        logger.info('===================================');

        // Start server
        await server.start();

        // Register shutdown handlers
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception:', error);
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled rejection at:', promise, 'reason:', reason);
            shutdown('unhandledRejection');
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Run main
main();
