# 🦅 Crypto Sentinel Bot v2

A high-performance, automated crypto trading bot designed for **survival and compounding**. It uses a **60/40 Core-Satellite strategy** combined with **LLM Sentiment Analysis** (Gemini) to catch momentum and news-driven pumps while protecting your base capital.

## 🚀 Key Features

*   **60/40 Portfolio Strategy**:
    *   **60% Core**: Buy & hold large-caps (BTC/ETH) to preserve wealth.
    *   **40% Satellite**: Active trading bucket for news-driven momentum plays.
*   **LLM News Filtering**: Uses **Gemini AI** to scan news sentiment and only trade on high-confidence signals.
*   **Professional Risk Management**:
    *   **OCO Orders**: Every trade automatically places a **Take Profit (Objective)** and **Stop Loss** simultaneously. No waiting around—the exchange handles the sell instantly when the target is hit.
    *   **Daily Breakers**: If the bot hits a daily loss limit or trade count, it halts automatically to protect clinical capital.
    *   **Position Sizing**: Automatically adjusts risk based on LLM confidence scores.
*   **24/7 Monitoring**:
    *   **Discord Integration**: Get trade alerts, status reports, and control the bot (pause/kill) directly from your phone.
    *   **VPS Optimized**: Lightweight Node.js engine designed to run on ultra-cheap (0.75€/mo) VPS servers.
*   **Installer**: Multi-platform installer for macOS and Linux.

---

## 🛠️ Installation

### Quick Install (macOS / Linux)
1.  Open your terminal.
2.  Run the installer:
    ```bash
    chmod +x install.sh
    ./install.sh
    ```
3.  Follow the prompts to enter your Binance and Gemini API keys.

---

## 🤖 Gemini Integration & Speed

The bot integrates with **Google Gemini 2.0 Flash** via API. 

**Why API instead of CLI?**
The bot uses the **Gemini API** directly within the code (supporting search grounding) to fetch real-time news about your trading pairs. 

**Gemini News Finder (CLI Tool):**
I've also included a separate **Gemini CLI** tool you can use manually to find news or ask questions:
```bash
npm run gemini "find the latest news for BTC"
```
This tool uses Google Search to give you up-to-the-minute info.

**How Objectives Work:**
You mentioned not wanting to wait for sells. The bot uses **Binance OCO (One-Cancels-Other)** orders.
1.  Bot buys BTC.
2.  Bot instantly sends TWO sell orders to Binance: one for your **Profit Goal** and one for your **Stop Loss**.
3.  The exchange holds these. The moment BTC hits your objective, it sells. **You don't have to wait for the bot to check the price.**

---

## 📱 Discord Commands

If you have Discord set up, you can control the bot with these commands:
*   `!status`: Get a full report on PnL, balance, and status.
*   `!pause`: Stop the satellite trading engine.
*   `!resume`: Start trading again.
*   `!kill`: Hard shutdown of the bot process.

---

## 🏗️ 24/7 Standalone Mode

The bot is designed to run by itself in the background using **PM2** (integrated into the project). 

*   **Start the bot**: `npm run start-bg`
*   **View live logs**: `npm run logs`
*   **Stop the bot**: `npm run stop-bg`

The bot will automatically restart if it crashes or if your server reboots.

---

## ⚠️ Security Rules

1.  **Binance API**: You MUST disable "Withdrawals" on your API key. Only enable "Spot Trading".
2.  **IP Restriction**: For maximum safety, restrict your API key to your VPS IP address.
3.  **Secrets**: Never share your `.env` file. It contains your money keys.

---

## 📉 Realistic Expectations (on 40€)

*   **Goal**: Cover VPS cost (0.75€) and compound.
*   **Conservative (10%/mo)**: Grows 40€ to ~108€ in 1 year.
*   **Moderate (20%/mo)**: Grows 40€ to ~321€ in 1 year.
*   **Supercharged**: Adding 30€/month can lead to ~1,744€ in 1 year.

*Disclaimer: Trading involves significant risk. This bot is a tool, not a guarantee. Use only money you can afford to lose.*
