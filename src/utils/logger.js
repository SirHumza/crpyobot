import winston from 'winston';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
);

// JSON format for file output (easier to parse later)
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// Create the logger
export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        // Console transport
        new winston.transports.Console({
            format: consoleFormat,
        }),
        // All logs file
        new winston.transports.File({
            filename: join(logsDir, 'bot.log'),
            format: fileFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
        }),
        // Error-only file
        new winston.transports.File({
            filename: join(logsDir, 'error.log'),
            level: 'error',
            format: fileFormat,
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
        }),
        // Trades log (separate for analysis)
        new winston.transports.File({
            filename: join(logsDir, 'trades.log'),
            format: fileFormat,
            maxsize: 50 * 1024 * 1024, // 50MB for trades
            maxFiles: 10,
        }),
    ],
});

/**
 * Log a trade event specifically
 */
export function logTrade(tradeData) {
    logger.info('TRADE', {
        type: 'trade',
        ...tradeData,
    });
}

/**
 * Log a signal event (LLM decision)
 */
export function logSignal(signalData) {
    logger.info('SIGNAL', {
        type: 'signal',
        ...signalData,
    });
}

/**
 * Log daily summary
 */
export function logDailySummary(summaryData) {
    logger.info('DAILY_SUMMARY', {
        type: 'daily_summary',
        ...summaryData,
    });
}

/**
 * Log breaker trigger
 */
export function logBreaker(breakerData) {
    logger.warn('BREAKER_TRIGGERED', {
        type: 'breaker',
        ...breakerData,
    });
}

export default logger;
