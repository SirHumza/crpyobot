import BinanceFactory from 'binance-api-node';
const Binance = BinanceFactory.default || BinanceFactory;
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Binance Exchange Wrapper
 * Handles all interactions with Binance API
 * Supports both live and testnet modes
 */
class BinanceExchange {
    constructor() {
        this.client = null;
        this.exchangeInfo = null;
        this.balances = {};
        this.openOrders = [];
    }

    /**
     * Initialize the Binance client
     */
    async init() {
        try {
            const options = {
                apiKey: config.binance.apiKey,
                apiSecret: config.binance.apiSecret,
            };

            // Use testnet if configured
            if (config.binance.testnet) {
                options.httpBase = 'https://testnet.binance.vision';
                options.wsBase = 'wss://testnet.binance.vision/ws';
                logger.info('Using Binance TESTNET');
            }

            this.client = Binance(options);

            // Fetch exchange info for symbol constraints
            this.exchangeInfo = await this.client.exchangeInfo();
            logger.info('Binance client initialized', {
                testnet: config.binance.testnet,
                symbols: this.exchangeInfo.symbols.length,
            });

            // Initial balance fetch
            await this.updateBalances();

            return true;
        } catch (error) {
            logger.error('Failed to initialize Binance client', { error: error.message });
            throw error;
        }
    }

    /**
     * Update account balances
     */
    async updateBalances() {
        try {
            // PAPER TRADING OVERRIDE
            if (config.paper.enabled) {
                // If we already have a paper balance tracking, keep using it
                // Otherwise initialize with starting balance
                if (!this.balances['USDT']) {
                    this.balances['USDT'] = {
                        free: config.paper.startingBalance,
                        locked: 0,
                        total: config.paper.startingBalance
                    };
                    logger.info('Initialized PAPER TRADING balance', { balance: config.paper.startingBalance });
                }
                return this.balances;
            }

            const account = await this.client.accountInfo();
            this.balances = {};

            for (const balance of account.balances) {
                const free = parseFloat(balance.free);
                const locked = parseFloat(balance.locked);
                if (free > 0 || locked > 0) {
                    this.balances[balance.asset] = {
                        free,
                        locked,
                        total: free + locked,
                    };
                }
            }

            logger.debug('Balances updated', { balances: this.balances });
            return this.balances;
        } catch (error) {
            logger.error('Failed to update balances', { error: error.message });
            throw error;
        }
    }

    /**
     * Get current price for a symbol
     */
    async getPrice(symbol) {
        try {
            const ticker = await this.client.prices({ symbol });
            return parseFloat(ticker[symbol]);
        } catch (error) {
            logger.error('Failed to get price', { symbol, error: error.message });
            throw error;
        }
    }

    /**
     * Get 24h ticker stats
     */
    async get24hStats(symbol) {
        try {
            return await this.client.dailyStats({ symbol });
        } catch (error) {
            logger.error('Failed to get 24h stats', { symbol, error: error.message });
            throw error;
        }
    }

    /**
     * Get candlestick data
     */
    async getCandles(symbol, interval = '1h', limit = 100) {
        try {
            const candles = await this.client.candles({ symbol, interval, limit });
            return candles.map(c => ({
                openTime: c.openTime,
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close),
                volume: parseFloat(c.volume),
                closeTime: c.closeTime,
                quoteVolume: parseFloat(c.quoteVolume),
            }));
        } catch (error) {
            logger.error('Failed to get candles', { symbol, error: error.message });
            throw error;
        }
    }

    /**
     * Get symbol trading rules
     */
    getSymbolInfo(symbol) {
        const symbolInfo = this.exchangeInfo.symbols.find(s => s.symbol === symbol);
        if (!symbolInfo) return null;

        const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
        const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
        const minNotionalFilter = symbolInfo.filters.find(f => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');

        return {
            symbol: symbolInfo.symbol,
            baseAsset: symbolInfo.baseAsset,
            quoteAsset: symbolInfo.quoteAsset,
            minQty: parseFloat(lotSizeFilter?.minQty || 0),
            maxQty: parseFloat(lotSizeFilter?.maxQty || 0),
            stepSize: parseFloat(lotSizeFilter?.stepSize || 0),
            minPrice: parseFloat(priceFilter?.minPrice || 0),
            maxPrice: parseFloat(priceFilter?.maxPrice || 0),
            tickSize: parseFloat(priceFilter?.tickSize || 0),
            minNotional: parseFloat(minNotionalFilter?.minNotional || minNotionalFilter?.notional || 0),
        };
    }

    /**
     * Round quantity to valid step size
     */
    roundQuantity(symbol, quantity) {
        const info = this.getSymbolInfo(symbol);
        if (!info) return quantity;

        const stepSize = info.stepSize;
        const precision = stepSize.toString().split('.')[1]?.length || 0;
        const rounded = Math.floor(quantity / stepSize) * stepSize;
        return parseFloat(rounded.toFixed(precision));
    }

    /**
     * Round price to valid tick size
     */
    roundPrice(symbol, price) {
        const info = this.getSymbolInfo(symbol);
        if (!info) return price;

        const tickSize = info.tickSize;
        const precision = tickSize.toString().split('.')[1]?.length || 0;
        const rounded = Math.round(price / tickSize) * tickSize;
        return parseFloat(rounded.toFixed(precision));
    }

    /**
     * Place a market buy order
     */
    async marketBuy(symbol, quantity) {
        try {
            const roundedQty = this.roundQuantity(symbol, quantity);

            logger.info('Placing market BUY order', { symbol, quantity: roundedQty });

            const order = await this.client.order({
                symbol,
                side: 'BUY',
                type: 'MARKET',
                quantity: roundedQty.toString(),
            });

            logger.info('Market BUY order filled', {
                symbol,
                orderId: order.orderId,
                executedQty: order.executedQty,
                cummulativeQuoteQty: order.cummulativeQuoteQty,
            });

            await this.updateBalances();
            return order;
        } catch (error) {
            logger.error('Market BUY failed', {
                symbol,
                quantity,
                code: error.code,
                msg: error.message,
                fullError: JSON.stringify(error)
            });
            throw error;
        }
    }

    /**
     * Place a market sell order
     */
    async marketSell(symbol, quantity) {
        try {
            const roundedQty = this.roundQuantity(symbol, quantity);

            logger.info('Placing market SELL order', { symbol, quantity: roundedQty });

            const order = await this.client.order({
                symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: roundedQty.toString(),
            });

            logger.info('Market SELL order filled', {
                symbol,
                orderId: order.orderId,
                executedQty: order.executedQty,
                cummulativeQuoteQty: order.cummulativeQuoteQty,
            });

            await this.updateBalances();
            return order;
        } catch (error) {
            logger.error('Market SELL failed', { symbol, quantity, error: error.message });
            throw error;
        }
    }

    /**
     * Place a limit sell order (take profit)
     */
    async limitSell(symbol, quantity, price) {
        try {
            const roundedQty = this.roundQuantity(symbol, quantity);
            const roundedPrice = this.roundPrice(symbol, price);

            logger.info('Placing LIMIT SELL order', { symbol, quantity: roundedQty, price: roundedPrice });

            const order = await this.client.order({
                symbol,
                side: 'SELL',
                type: 'LIMIT',
                quantity: roundedQty.toString(),
                price: roundedPrice.toString(),
                timeInForce: 'GTC',
            });

            logger.info('LIMIT SELL order placed', {
                symbol,
                orderId: order.orderId,
                price: roundedPrice,
                status: order.status,
            });

            return order;
        } catch (error) {
            logger.error('LIMIT SELL failed', { symbol, quantity, price, error: error.message });
            throw error;
        }
    }

    /**
     * Place a stop-loss sell order
     */
    async stopLossSell(symbol, quantity, stopPrice) {
        try {
            const roundedQty = this.roundQuantity(symbol, quantity);
            const roundedStopPrice = this.roundPrice(symbol, stopPrice);
            // Sell at stop price when triggered
            const roundedPrice = this.roundPrice(symbol, stopPrice * 0.995); // Slightly below stop

            logger.info('Placing STOP-LOSS order', { symbol, quantity: roundedQty, stopPrice: roundedStopPrice });

            const order = await this.client.order({
                symbol,
                side: 'SELL',
                type: 'STOP_LOSS_LIMIT',
                quantity: roundedQty.toString(),
                price: roundedPrice.toString(),
                stopPrice: roundedStopPrice.toString(),
                timeInForce: 'GTC',
            });

            logger.info('STOP-LOSS order placed', {
                symbol,
                orderId: order.orderId,
                stopPrice: roundedStopPrice,
                status: order.status,
            });

            return order;
        } catch (error) {
            logger.error('STOP-LOSS order failed', { symbol, quantity, stopPrice, error: error.message });
            throw error;
        }
    }

    /**
     * Place OCO (One-Cancels-Other) order for TP + SL
     */
    async ocoSell(symbol, quantity, takeProfitPrice, stopLossPrice) {
        try {
            const roundedQty = this.roundQuantity(symbol, quantity);
            const roundedTP = this.roundPrice(symbol, takeProfitPrice);
            const roundedSL = this.roundPrice(symbol, stopLossPrice);
            const roundedSLLimit = this.roundPrice(symbol, stopLossPrice * 0.995);

            logger.info('Placing OCO SELL order', {
                symbol,
                quantity: roundedQty,
                takeProfit: roundedTP,
                stopLoss: roundedSL,
            });

            const order = await this.client.orderOco({
                symbol,
                side: 'SELL',
                quantity: roundedQty.toString(),
                price: roundedTP.toString(),
                stopPrice: roundedSL.toString(),
                stopLimitPrice: roundedSLLimit.toString(),
                stopLimitTimeInForce: 'GTC',
            });

            logger.info('OCO order placed', {
                symbol,
                orderListId: order.orderListId,
                contingencyType: order.contingencyType,
            });

            return order;
        } catch (error) {
            logger.error('OCO order failed', { symbol, error: error.message });
            throw error;
        }
    }

    /**
     * Cancel an order
     */
    async cancelOrder(symbol, orderId) {
        try {
            const result = await this.client.cancelOrder({ symbol, orderId });
            logger.info('Order cancelled', { symbol, orderId });
            return result;
        } catch (error) {
            logger.error('Cancel order failed', { symbol, orderId, error: error.message });
            throw error;
        }
    }

    /**
     * Get open orders
     */
    async getOpenOrders(symbol = null) {
        try {
            const params = symbol ? { symbol } : {};
            this.openOrders = await this.client.openOrders(params);
            return this.openOrders;
        } catch (error) {
            logger.error('Failed to get open orders', { error: error.message });
            throw error;
        }
    }

    /**
     * Cancel all open orders for a symbol
     */
    async cancelAllOrders(symbol) {
        try {
            const openOrders = await this.getOpenOrders(symbol);
            for (const order of openOrders) {
                await this.cancelOrder(symbol, order.orderId);
            }
            logger.info('All orders cancelled', { symbol, count: openOrders.length });
            return openOrders.length;
        } catch (error) {
            logger.error('Cancel all orders failed', { symbol, error: error.message });
            throw error;
        }
    }

    /**
     * Get total portfolio value in USDT
     */
    async getTotalValueUsdt() {
        try {
            await this.updateBalances();
            let totalValue = 0;

            for (const [asset, balance] of Object.entries(this.balances)) {
                if (balance.total <= 0) continue;

                if (asset === 'USDT') {
                    totalValue += balance.total;
                } else {
                    try {
                        const price = await this.getPrice(`${asset}USDT`);
                        totalValue += balance.total * price;
                    } catch {
                        // Skip assets without USDT pair
                    }
                }
            }

            return totalValue;
        } catch (error) {
            logger.error('Failed to calculate total value', { error: error.message });
            throw error;
        }
    }
}

// Singleton instance
export const binance = new BinanceExchange();
export default binance;
