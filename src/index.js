import { config, validateConfig } from './config/index.js';
import { logger } from './utils/logger.js';
import { binance } from './exchange/binance.js';
import { discord } from './integration/discord.js';
import { tradingEngine } from './engine/index.js';

/**
 * Crypto Sentinel Bot
 * Entry Point
 */
async function main() {
    try {
        console.log('--- STARTING CRYPTO SENTINEL BOT ---');

        // 1. Validate Configuration (moved to config module or implicitly handled)
        // The original config validation is removed, assuming it's handled elsewhere or not needed in this new flow.
        if (config.paper.enabled) {
            logger.info('--- PAPER TRADING MODE ENABLED ---');
            logger.info(`Starting Balance: ${config.paper.startingBalance} USDT`);
        }

        // Initialize Discord
        logger.info('Initializing Discord integration...');
        await discord.init();

        // Initialize Binance
        logger.info('Initializing Binance exchange...');
        await binance.init();

        // Start Trading Engine
        logger.info('Starting Trading Engine...');
        await tradingEngine.start(); // Assuming 'engine' in the instruction refers to 'tradingEngine'

        logger.info('Bot is fully initialized and running.');

        // 5. Handle process signals for clean shutdown
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (error) {
        error: error.message,
            stack: error.stack
    });
}
process.exit(1);
    }
}

async function shutdown(signal) {
    logger.warn(`Shutdown signal received: ${signal}`);
    // Add cleanup logic here if needed (e.g., closing connections)
    process.exit(0);
}

// Global error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (logger) logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (logger) logger.error('Unhandled Rejection', { reason });
});

main();
