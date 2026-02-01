import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Centralized configuration for the trading bot
 * All values are validated and have sensible defaults
 */
export const config = {
  // Binance
  binance: {
    apiKey: process.env.BINANCE_API_KEY || '',
    apiSecret: process.env.BINANCE_API_SECRET || '',
    testnet: process.env.BINANCE_TESTNET === 'true',
  },

  // LLM Provider
  llm: {
    provider: process.env.LLM_PROVIDER || 'gemini',
    geminiKey: process.env.GEMINI_API_KEY || '',
    openaiKey: process.env.OPENAI_API_KEY || '',
  },

  // Discord
  discord: {
    token: process.env.DISCORD_BOT_TOKEN || '',
    channelId: process.env.DISCORD_CHANNEL_ID || '',
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    adminUserIds: (process.env.DISCORD_ADMIN_USER_IDS || '').split(',').filter(Boolean),
  },

  // Trading
  trading: {
    baseCurrency: process.env.BASE_CURRENCY || 'USDT',
    pairs: (process.env.TRADING_PAIRS || 'BTCUSDT,ETHUSDT').split(','),
    coreCoins: (process.env.CORE_COINS || 'BTCUSDT,ETHUSDT').split(','),
    scanInterval: parseInt(process.env.SCAN_INTERVAL_MS) || 1800000,
  },

  // Allocation (60/40 default)
  allocation: {
    core: parseFloat(process.env.CORE_ALLOCATION) || 0.60,
    satellite: parseFloat(process.env.SATELLITE_ALLOCATION) || 0.40,
  },

  // Risk Management
  risk: {
    maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE) || 0.01,
    maxSatelliteExposure: parseFloat(process.env.MAX_SATELLITE_EXPOSURE) || 0.25,
    dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT) || 0.05,
    maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN) || 0.15,
    defaultStopLoss: parseFloat(process.env.DEFAULT_STOP_LOSS) || 0.02,
    defaultTakeProfit: parseFloat(process.env.DEFAULT_TAKE_PROFIT) || 0.04,
    maxTradesPerDay: parseInt(process.env.MAX_TRADES_PER_DAY) || 10,
    minOrderSizeUsdt: parseFloat(process.env.MIN_ORDER_SIZE_USDT) || 10,
    maxOpenSatelliteTrades: parseInt(process.env.MAX_OPEN_SATELLITE_TRADES) || 2,
    minBalanceToTrade: parseFloat(process.env.MIN_BALANCE_TO_TRADE) || 15,
    minSentiment: parseInt(process.env.MIN_MARKET_SENTIMENT) || 20,
  },

  // LLM Confidence Thresholds
  confidence: {
    minToTrade: parseInt(process.env.MIN_CONFIDENCE_TO_TRADE) || 60,
    highThreshold: parseInt(process.env.HIGH_CONFIDENCE_THRESHOLD) || 85,
  },

  // Technical Filters
  technicals: {
    minVolumeUsdt: parseFloat(process.env.MIN_VOLUME_USDT) || 100000,
    rsiOversold: parseFloat(process.env.RSI_OVERSOLD) || 30,
    rsiOverbought: parseFloat(process.env.RSI_OVERBOUGHT) || 70,
  },

  // Paper Trading
  paper: {
    enabled: process.env.PAPER_TRADE === 'true',
    startingBalance: parseFloat(process.env.PAPER_STARTING_BALANCE) || 1000,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    toFile: process.env.LOG_TO_FILE !== 'false',
  },
};

/**
 * Validate critical configuration
 */
export function validateConfig() {
  const errors = [];

  if (!config.binance.apiKey && !config.paper.enabled) {
    errors.push('BINANCE_API_KEY is required for live trading');
  }
  if (!config.binance.apiSecret && !config.paper.enabled) {
    errors.push('BINANCE_API_SECRET is required for live trading');
  }
  if (!config.llm.geminiKey && !config.llm.openaiKey) {
    errors.push('At least one LLM API key is required (GEMINI_API_KEY or OPENAI_API_KEY)');
  }
  if (config.allocation.core + config.allocation.satellite !== 1.0) {
    errors.push('Core + Satellite allocation must equal 1.0 (100%)');
  }

  return errors;
}

export default config;
