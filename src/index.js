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

        // 1. Validate Configuration
        const configErrors = validateConfig();
        if (configErrors.length > 0) {
            console.error('Configuration Errors:');
            configErrors.forEach(err => console.error(` - ${err}`));
            process.exit(1);
        }

        // 2. Initialize Exchange
        logger.info('Initializing Binance exchange...');
        await binance.init();

        // 3. Initialize Discord
        logger.info('Initializing Discord integration...');
        await discord.init();

        // 4. Start Trading Engine
        logger.info('Starting trading engine...');
        await tradingEngine.start();

        logger.info('Bot is fully initialized and running.');

        // 5. Handle process signals for clean shutdown
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (error) {
        console.error('FATAL SYSTEM ERROR:', error);
        if (logger) {
            logger.error('CRITICAL: Fatal system error occurred', {
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
