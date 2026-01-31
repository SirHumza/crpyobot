import test from 'node:test';
import assert from 'node:assert';
import { riskManager } from '../src/engine/risk.js';
import { config } from '../src/config/index.js';

/**
 * MOCK INTEGRATION TEST
 * Verifies that the bot's logic components (Risk, Sentiment, Engine) 
 * can transition from news -> position size -> stop losses correctly.
 */

test('Risk Manager: Position Sizing with Small Account Logic', (t) => {
    riskManager.resetBreaker();
    // Setup: $50 account
    const capital = 50.0;

    // 1. Test Low Confidence (should follow base risk)
    const sizeLow = riskManager.calculatePositionSize(capital, 65);
    // Base risk is 1%, but Binance minimum is $10. 
    // 1% of 50 is $0.50. Risk manager should bump this to $10.
    assert.strictEqual(sizeLow, 10.0, 'Should bump small trade to Binance $10 minimum');

    // 2. Test High Confidence (should double risk)
    const sizeHigh = riskManager.calculatePositionSize(capital, 95);
    // 2% of 50 is $1.00. Still below $10, so should bump to $10.
    assert.strictEqual(sizeHigh, 10.0, 'Should still bump to minimum for high confidence on $50 account');
});

test('Risk Manager: Stop Loss & Dynamic Take Profit', (t) => {
    const entry = 100.0;

    // 1. Default (No AI target)
    const exitsDefault = riskManager.getExitPoints(entry, 'BUY');
    assert.strictEqual(exitsDefault.stopLoss, 98.0); // -2%
    assert.strictEqual(exitsDefault.takeProfit, 104.0); // +4%

    // 2. AI Suggested High Gain (Target 10%)
    const exitsAI = riskManager.getExitPoints(entry, 'BUY', 10);
    assert.strictEqual(exitsAI.stopLoss, 98.0);
    // Use a small epsilon check for floating point math
    assert.ok(Math.abs(exitsAI.takeProfit - 110.0) < 0.0001, `Expected 110, got ${exitsAI.takeProfit}`);
});

test('Risk Manager: Panic Breakers', (t) => {
    riskManager.resetBreaker();

    // Simulate balance drop to $10 ($50 -> $10 is -80%)
    riskManager.updateBalance(10.0);
    assert.strictEqual(riskManager.canTrade(), false, 'Should halt trading if account drops below safe minimum');

    riskManager.resetBreaker();
});
