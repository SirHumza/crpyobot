import { config } from '../config/index.js';
import { logger, logBreaker } from '../utils/logger.js';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../../data');

/**
 * Risk Manager
 * Manages capital allocation, position sizing, and stop-losses
 */
class RiskManager {
    constructor() {
        this.dailyStats = {
            date: new Date().toISOString().split('T')[0],
            initialBalance: 0,
            currentBalance: 0,
            tradesCount: 0,
            dailyPnL: 0,
            isHalted: false
        };

        this.ensureDataDir();
        this.loadStats();
    }

    ensureDataDir() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    loadStats() {
        const filePath = join(DATA_DIR, 'daily_stats.json');
        const today = new Date().toISOString().split('T')[0];

        if (fs.existsSync(filePath)) {
            const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (saved.date === today) {
                this.dailyStats = saved;
                return;
            }
        }

        // Reset for new day
        this.dailyStats = {
            date: today,
            initialBalance: 0, // Will be set on first heartbeat
            currentBalance: 0,
            tradesCount: 0,
            dailyPnL: 0,
            isHalted: false
        };
        this.saveStats();
    }

    saveStats() {
        const filePath = join(DATA_DIR, 'daily_stats.json');
        fs.writeFileSync(filePath, JSON.stringify(this.dailyStats, null, 2));
    }

    /**
     * Update daily stats with new balance info
     */
    updateBalance(totalValue) {
        if (this.dailyStats.initialBalance === 0) {
            this.dailyStats.initialBalance = totalValue;
        }
        this.dailyStats.currentBalance = totalValue;
        this.dailyStats.dailyPnL = (totalValue / this.dailyStats.initialBalance) - 1;

        this.checkBreakers();
        this.saveStats();
    }

    /**
     * Check if any risk breakers have been triggered
     */
    checkBreakers() {
        // 1. Daily Loss Limit
        if (this.dailyStats.dailyPnL <= -config.risk.dailyLossLimit) {
            if (!this.dailyStats.isHalted) {
                this.dailyStats.isHalted = true;
                logBreaker({
                    reason: 'Daily loss limit reached',
                    pnl: this.dailyStats.dailyPnL,
                    limit: -config.risk.dailyLossLimit
                });
            }
        }

        // 2. Max Trades per Day
        if (this.dailyStats.tradesCount >= config.risk.maxTradesPerDay) {
            if (!this.dailyStats.isHalted) {
                this.dailyStats.isHalted = true;
                logBreaker({
                    reason: 'Max daily trades reached',
                    count: this.dailyStats.tradesCount
                });
            }
        }

        // 3. Absolute Minimum Balance (Small Account Protection)
        if (this.dailyStats.currentBalance > 0 && this.dailyStats.currentBalance < config.risk.minBalanceToTrade) {
            if (!this.dailyStats.isHalted) {
                this.dailyStats.isHalted = true;
                logBreaker({
                    reason: 'Balance below safe threshold',
                    balance: this.dailyStats.currentBalance,
                    min: config.risk.minBalanceToTrade
                });
            }
        }
    }

    /**
     * Calculate how much to risk on a trade based on LLM confidence
     */
    calculatePositionSize(totalCapital, confidenceScore) {
        if (this.dailyStats.isHalted) return 0;

        // Confidence must be above minimum threshold
        if (confidenceScore < config.confidence.minToTrade) return 0;

        // Satellite allocation (40%)
        const satelliteCapital = totalCapital * config.allocation.satellite;

        // Base risk: 1% of total capital per trade
        let riskFactor = config.risk.maxRiskPerTrade;

        // Scale risk by confidence
        if (confidenceScore >= config.confidence.highThreshold) {
            riskFactor *= 2;
        } else if (confidenceScore >= 75) {
            riskFactor *= 1.5;
        }

        let tradeValue = totalCapital * riskFactor;

        // SMALL ACCOUNT ADJUSTMENT: 
        // If tradeValue is less than Binance minimum ($10), and we have enough room in satellite,
        // we use the minimum. Otherwise, we can't trade.
        if (tradeValue < config.risk.minOrderSizeUsdt) {
            if (satelliteCapital >= config.risk.minOrderSizeUsdt) {
                logger.debug('Adjusting trade value to minimum allowed order size', { original: tradeValue, min: config.risk.minOrderSizeUsdt });
                tradeValue = config.risk.minOrderSizeUsdt;
            } else {
                logger.warn('Insufficient satellite capital for minimum order size', { satelliteCapital });
                return 0;
            }
        }

        // CAP: Never use more than X% of the satellite bucket for a single trade
        // EXCEPTION: If the cap is below the Binance minimum, we allow it to reach the minimum
        const maxSatelliteTrade = Math.max(
            satelliteCapital * config.risk.maxSatelliteExposure,
            config.risk.minOrderSizeUsdt
        );

        if (tradeValue > maxSatelliteTrade) {
            tradeValue = maxSatelliteTrade;
        }

        // Final check against minimum after cap
        if (tradeValue < config.risk.minOrderSizeUsdt) {
            // Last ditch effort: if we are close (within 10%), just use the minimum
            if (satelliteCapital >= config.risk.minOrderSizeUsdt) {
                tradeValue = config.risk.minOrderSizeUsdt;
            } else {
                return 0;
            }
        }

        return tradeValue;
    }

    /**
     * Get Stop Loss and Take Profit prices
     */
    getExitPoints(entryPrice, side = 'BUY', targetGain = null) {
        const slPercent = config.risk.defaultStopLoss;
        let tpPercent = config.risk.defaultTakeProfit;

        // Use AI suggested target if valid, otherwise use default
        if (targetGain && typeof targetGain === 'number') {
            tpPercent = Math.min(Math.max(targetGain / 100, 0.02), 0.15);
            logger.debug('Using AI suggested take profit', { tpPercent });
        }

        if (side === 'BUY') {
            return {
                stopLoss: entryPrice * (1 - slPercent),
                takeProfit: entryPrice * (1 + tpPercent)
            };
        } else {
            return {
                stopLoss: entryPrice * (1 + slPercent),
                takeProfit: entryPrice * (1 - tpPercent)
            };
        }
    }

    recordTrade() {
        this.dailyStats.tradesCount++;
        this.checkBreakers();
        this.saveStats();
    }

    canTrade() {
        return !this.dailyStats.isHalted;
    }

    resetBreaker() {
        this.dailyStats.isHalted = false;
        this.saveStats();
    }
}

export const riskManager = new RiskManager();
export default riskManager;
