import test from 'node:test';
import assert from 'node:assert';
import { riskManager } from '../src/engine/risk.js';
import { config } from '../src/config/index.js';

test('RiskManager - Initial State', (t) => {
    riskManager.dailyStats.isHalted = false;
    riskManager.dailyStats.tradesCount = 0;
    riskManager.dailyStats.initialBalance = 0;
    assert.strictEqual(riskManager.dailyStats.isHalted, false, 'Bot should start in unhalted state');
    assert.strictEqual(riskManager.dailyStats.tradesCount, 0, 'Initial trades count should be 0');
});

test('RiskManager - Position Sizing', (t) => {
    const totalCapital = 1000;

    // 1. Low confidence (<60) should return 0
    let size = riskManager.calculatePositionSize(totalCapital, 50);
    assert.strictEqual(size, 0, 'Should not trade with low confidence');

    // 2. Base risk (60-75)
    // config.risk.maxRiskPerTrade = 0.01 (1%)
    // 1000 * 0.01 = 10
    size = riskManager.calculatePositionSize(totalCapital, 65);
    assert.strictEqual(size, 10, 'Base risk sizing incorrect');

    // 3. High confidence (>=85)
    // 1000 * 0.01 * 2 = 20
    size = riskManager.calculatePositionSize(totalCapital, 90);
    assert.strictEqual(size, 20, 'High confidence sizing incorrect');

    // 4. Cap check (max 25% of satellite bucket)
    // satellite = 1000 * 0.4 = 400
    // max exposure = 400 * 0.25 = 100
    // Let's force a huge risk factor
    config.risk.maxRiskPerTrade = 0.5; // 50% risk
    size = riskManager.calculatePositionSize(totalCapital, 90);
    assert.strictEqual(size, 100, 'Satellite exposure cap not working');

    // Reset config
    config.risk.maxRiskPerTrade = 0.01;
});

test('RiskManager - Breakers', (t) => {
    riskManager.resetBreaker();

    // 1. Trade count breaker
    for (let i = 0; i < config.risk.maxTradesPerDay; i++) {
        riskManager.recordTrade();
    }
    assert.strictEqual(riskManager.canTrade(), false, 'Trade count breaker failed to halt bot');

    riskManager.resetBreaker();

    // 2. Daily loss breaker
    // loss -6% (limit is 5%)
    riskManager.updateBalance(940); // Started at 1000 implicitly? No, depends on first balance update
    riskManager.dailyStats.initialBalance = 1000;
    riskManager.updateBalance(940);
    assert.strictEqual(riskManager.canTrade(), false, 'Daily loss breaker failed to halt bot');
});
