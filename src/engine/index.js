import { binance } from '../exchange/binance.js';
import { sentimentAnalyzer } from '../signal/sentiment.js';
import { riskManager } from './risk.js';
import { discord } from '../integration/discord.js';
import { logger, logTrade } from '../utils/logger.js';
import { config } from '../config/index.js';
import { RSI } from 'technicalindicators';

/**
 * Main Trading Engine
 * Orchestrates signals, risk management, and execution
 */
class TradingEngine {
    constructor() {
        this.isRunning = false;
        this.lastCheckTime = 0;
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info('Starting Trading Engine...');

        // Core loop
        this.runLoop();

        // Schedule periodic heartbeat and daily rebalancing
        setInterval(() => this.heartbeat(), 60000); // Every minute
    }

    async runLoop() {
        while (this.isRunning) {
            try {
                await this.tick();
                await this.manageTrailingStops();
                // Wait 30 minutes between full scans (1,800,000 ms)
                await new Promise(resolve => setTimeout(resolve, 1800000));
            } catch (error) {
                logger.error('Error in main tick loop', { error: error.message });
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }
    }

    async tick() {
        logger.debug('Trading engine tick started');

        // 1. Update Portfolio Stats
        const totalValue = await binance.getTotalValueUsdt();
        riskManager.updateBalance(totalValue);

        if (!riskManager.canTrade()) {
            logger.warn('Trading is currently halted by risk manager');
            return;
        }

        // 2. Global Market Sentiment Check (Panic Breaker)
        const marketSentiment = await this.getMarketSentiment();
        if (marketSentiment < config.risk.minSentiment) {
            logger.warn('Market sentiment below threshold. Skipping satellite signals for safety.', {
                sentiment: marketSentiment,
                threshold: config.risk.minSentiment
            });
            return;
        }

        // 3. Count active trades (Open Orders + Positions in satellite pairs)
        const openOrders = await binance.getOpenOrders();
        const activeSatellitePairs = new Set();

        // Count symbols with open orders
        openOrders.forEach(o => {
            if (!config.trading.coreCoins.includes(o.symbol)) {
                activeSatellitePairs.add(o.symbol);
            }
        });

        if (activeSatellitePairs.size >= config.risk.maxOpenSatelliteTrades) {
            logger.info('Max active satellite trades reached', { count: activeSatellitePairs.size });
            return;
        }

        // 3. Scan each pair
        for (const pair of config.trading.pairs) {
            // Already trading this? Skip.
            if (activeSatellitePairs.has(pair)) continue;

            await this.processPair(pair);

            // Re-check limit during the loop to avoid over-ordering
            const currentOpen = await binance.getOpenOrders();
            const currentPairs = new Set(currentOpen.map(o => o.symbol).filter(s => !config.trading.coreCoins.includes(s)));
            if (currentPairs.size >= config.risk.maxOpenSatelliteTrades) break;
        }
    }

    async processPair(pair) {
        try {
            // 1. Technical Indicators check (Multi-Timeframe: 1h + 4h)
            const candles1h = await binance.getCandles(pair, '1h', 50);
            const candles4h = await binance.getCandles(pair, '4h', 30);

            const rsi1h = RSI.calculate({ values: candles1h.map(c => c.close), period: 14 }).slice(-1)[0];
            const rsi4h = RSI.calculate({ values: candles4h.map(c => c.close), period: 14 }).slice(-1)[0];

            logger.debug(`Pair ${pair} analysis`, { rsi1h, rsi4h });

            // Trend alignment: Don't buy if the 4h trend is extremely overbought (>65)
            if (rsi4h > 65) return;

            const isOversold = rsi1h < config.technicals.rsiOversold;
            const isMomentumUp = rsi1h > 45 && rsi1h < 60; // Sweet spot for momentum

            // 2. Volatility Filter (Anti-Flash Crash)
            const low = Math.min(...candles1h.slice(-3).map(c => c.low));
            const high = Math.max(...candles1h.slice(-3).map(c => c.high));
            const volatility = (high / low) - 1;

            if (volatility > 0.05) {
                logger.warn(`Skipping ${pair} due to high volatility`, { volatility: `${(volatility * 100).toFixed(2)}%` });
                return;
            }

            // 3. ONLY if technicals show promise, check News/Sentiment
            if (isOversold || isMomentumUp) {
                const newsItems = await sentimentAnalyzer.getLatestNews(pair);

                for (const news of newsItems) {
                    const analysis = await sentimentAnalyzer.analyzeNews(news, pair);

                    if (analysis && analysis.suggested_action === 'BUY' && analysis.verdict === 'BULLISH' && analysis.confidence > 80) {
                        await this.executeSatelliteTrade(pair, analysis);
                        break; // One trade per pair per scan
                    }
                }
            }
        } catch (error) {
            logger.error(`Failed to process pair ${pair}`, { error: error.message });
        }
    }

    /**
     * Trailing Stop Logic
     * If price moved up 2%, move SL to break-even. 
     * If move up 4%, move SL to 2% profit.
     */
    async manageTrailingStops() {
        try {
            const openOrders = await binance.getOpenOrders();
            // Find our OCO Stop-Loss orders
            const stopOrders = openOrders.filter(o => o.type === 'STOP_LOSS_LIMIT' || o.type === 'STOP_LOSS');

            for (const order of stopOrders) {
                const currentPrice = await binance.getPrice(order.symbol);
                const stopPrice = parseFloat(order.stopPrice);

                // Logic: If price is 2% above stop price, move stop price up by 1%
                // This is more aggressive to lock in small account gains
                if (currentPrice > stopPrice * 1.02) {
                    const newStopPrice = stopPrice * 1.01;
                    logger.info(`Trailing stop triggered for ${order.symbol}`, { old: stopPrice, new: newStopPrice });

                    // Cancel old OCO and set new one
                    if (order.orderListId !== -1) {
                        await binance.client.cancelOrderList({
                            symbol: order.symbol,
                            orderListId: order.orderListId
                        });
                    } else {
                        await binance.cancelOrder(order.symbol, order.orderId);
                    }

                    // We don't recalculate TP during trail, just move the SL
                    // Need to find the original TP from the open order set
                    const originalTP = openOrders.find(o => o.symbol === order.symbol && o.type === 'LIMIT_MAKER')?.price || currentPrice * 1.04;

                    await binance.ocoSell(order.symbol, order.origQty, originalTP, newStopPrice);

                    discord.sendAlert(`🛡️ Trailing Stop updated for ${order.symbol} to ${newStopPrice.toFixed(4)}`);
                }
            }
        } catch (error) {
            logger.error('Error managing trailing stops', { error: error.message });
        }
    }

    async executeSatelliteTrade(pair, analysis) {
        try {
            const totalValue = await binance.getTotalValueUsdt();
            const tradeSizeUsdt = riskManager.calculatePositionSize(totalValue, analysis.confidence);

            if (tradeSizeUsdt <= 0) {
                logger.info('Risk manager rejected trade size', { pair, confidence: analysis.confidence });
                return;
            }

            const currentPrice = await binance.getPrice(pair);
            const quantity = tradeSizeUsdt / currentPrice;

            // Place market buy
            const order = await binance.marketBuy(pair, quantity);

            // Calculate SL and TP (Dynamic based on AI)
            const { stopLoss, takeProfit } = riskManager.getExitPoints(currentPrice, 'BUY', analysis.target_gain);

            // Place OCO order for Exit
            await binance.ocoSell(pair, order.executedQty, takeProfit, stopLoss);

            // Record trade
            riskManager.recordTrade();
            logTrade({
                symbol: pair,
                side: 'BUY',
                price: currentPrice,
                quantity: order.executedQty,
                confidence: analysis.confidence,
                reason: analysis.reasoning,
                tp: takeProfit,
                sl: stopLoss
            });

            discord.sendTradeAlert({
                symbol: pair,
                side: 'BUY',
                price: currentPrice,
                quantity: order.executedQty,
                reason: analysis.reasoning
            });

        } catch (error) {
            logger.error('Failed to execute satellite trade', { pair, error: error.message });
        }
    }

    async heartbeat() {
        try {
            const totalValue = await binance.getTotalValueUsdt();
            riskManager.updateBalance(totalValue);

            // Maintain the 60% Core (BTC/ETH) split
            await this.checkMaintainCore(totalValue);

            // Dynamic Trailing Stops Check
            await this.manageTrailingStops();

            // Daily Performance Recap (Every 24h)
            const now = Date.now();
            if (!this.lastRecapTime || now - this.lastRecapTime > 86400000) {
                await this.sendDailyRecap(totalValue);
                this.lastRecapTime = now;
            }

            logger.info('Heartbeat', {
                totalValue: totalValue.toFixed(2),
                dailyPnL: `${(riskManager.dailyStats.dailyPnL * 100).toFixed(2)}%`,
                status: riskManager.canTrade() ? 'RUNNING' : 'HALTED'
            });
        } catch (error) {
            logger.error('Heartbeat error', { error: error.message });
        }
    }

    /**
     * Fetches current market fear/greed (0-100)
     */
    async getMarketSentiment() {
        try {
            const response = await fetch('https://api.alternative.me/fng/');
            const json = await response.json();
            return parseInt(json.data[0].value);
        } catch (error) {
            logger.error('Failed to fetch market sentiment', { error: error.message });
            return 50; // Neutral default on error
        }
    }

    async sendDailyRecap(totalValue) {
        const pnl = riskManager.dailyStats.dailyPnL * 100;
        const pnlColor = pnl >= 0 ? '🟢' : '🔴';

        const message = `
📊 **DAILY PERFORMANCE RECAP**
${pnlColor} **PnL:** ${pnl.toFixed(2)}%
💰 **Total Balance:** ${totalValue.toFixed(2)} USDT
📉 **Trades Today:** ${riskManager.dailyStats.tradesCount}
🛡️ **Status:** ${riskManager.canTrade() ? 'Operational' : 'Halted (Risk Breaker)'}

*Compounding is the 8th wonder of the world. Let's keep growing!* 🦅
        `;

        await discord.sendAlert(message);
    }

    /**
     * Ensures that 60% of the total portfolio is held in Core coins (BTC/ETH)
     */
    async checkMaintainCore(totalValue) {
        try {
            const targetCoreValue = totalValue * config.allocation.core;
            const coreCoins = config.trading.coreCoins; // ['BTCUSDT', 'ETHUSDT']

            // Check current core value
            let currentCoreValue = 0;
            for (const pair of coreCoins) {
                const asset = pair.replace('USDT', '');
                const balance = binance.balances[asset]?.total || 0;
                const price = await binance.getPrice(pair);
                currentCoreValue += balance * price;
            }

            // If Core is less than 55% (5% buffer to avoid fee churn), buy more
            if (currentCoreValue < totalValue * (config.allocation.core - 0.05)) {
                const deficit = targetCoreValue - currentCoreValue;
                logger.info('Core allocation below target. Rebalancing...', { deficit });

                // Buy BTC with half the deficit, ETH with half
                const buyAmount = deficit / coreCoins.length;
                for (const pair of coreCoins) {
                    if (buyAmount >= config.risk.minOrderSizeUsdt) {
                        const price = await binance.getPrice(pair);
                        await binance.marketBuy(pair, buyAmount / price);
                        discord.sendAlert(`⚖️ Core Rebalance: Bought ${buyAmount.toFixed(2)} USDT of ${pair}`);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to maintain core allocation', { error: error.message });
        }
    }
}

export const tradingEngine = new TradingEngine();
export default tradingEngine;
