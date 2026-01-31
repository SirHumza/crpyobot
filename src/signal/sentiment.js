import fetch from 'node-fetch';
import { config } from '../config/index.js';
import { logger, logSignal } from '../utils/logger.js';

/**
 * Sentiment Analyzer
 * Interfaces with LLMs (Gemini/OpenAI) to analyze market news
 */
class SentimentAnalyzer {
    constructor() {
        this.geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.llm.geminiKey}`;
    }

    /**
     * Primary logic for analyzing a news item
     */
    async analyzeNews(newsItem, asset) {
        try {
            logger.info('Analyzing news sentiment', { asset, newsItem: newsItem.substring(0, 100) + '...' });

            const prompt = this.buildPrompt(newsItem, asset);
            const text = await this.callGemini(prompt);

            if (text) {
                // Clean potential markdown code blocks and parse JSON
                const jsonStr = text.replace(/```json|```/g, '').trim();
                const result = JSON.parse(jsonStr);

                logSignal({
                    asset,
                    ...result,
                    newsSnippet: newsItem.substring(0, 200)
                });
                return result;
            }

            return null;
        } catch (error) {
            logger.error('Sentiment analysis failed', { error: error.message });
            return null;
        }
    }

    buildPrompt(news, asset) {
        return `
      You are a high-performance crypto quantitative analyst specializing in scam detection and institutional-grade news filtering. 
      Analyze the following news item for the asset: ${asset}.
      
      News Item: "${news}"
      
      RULES FOR MAXIMUM SKEPTICISM:
      1. IGNORE any news that sounds like a marketing "hype" post or "partnership" with no technical details.
      2. IGNORE "listing news" unless it is a Tier 1 exchange (Binance, Coinbase).
      3. LOOK FOR: Mainnet launches, significant hack recoveries, institutional ETF inflows, or major regulatory wins.
      4. IF THE NEWS IS VAGUE: Set confidence to < 40 and suggested_action to FOLD.
      5. BE BRUTAL: Your goal is 100% survival. One bad trade wipes out the 50€ account.
      
      Output Format (JSON ONLY):
      {
        "verdict": "BULLISH" | "BEARISH" | "NEUTRAL",
        "impact": "LOW" | "MEDIUM" | "HIGH",
        "confidence": 0-100,
        "target_gain": 2.5-12.0, (Estimate expected % move based on news gravity)
        "reasoning": "1-sentence brutal truth",
        "suggested_action": "BUY" | "SELL" | "FOLD"
      }
    `;
    }

    async callGemini(prompt, useSearch = false) {
        try {
            if (!config.llm.geminiKey) {
                throw new Error('Gemini API key not configured');
            }

            const body = {
                contents: [{
                    parts: [{ text: prompt }]
                }]
            };

            if (useSearch) {
                body.tools = [{ google_search: {} }];
            }

            const response = await fetch(this.geminiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(`Gemini API Error: ${data.error.message}`);
            }

            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return text;
        } catch (error) {
            logger.error('Gemini API call failed', { error: error.message });
            return null;
        }
    }

    /**
     * Use Gemini with Google Search grounding to FIND the latest news
     */
    async getLatestNews(symbol) {
        try {
            if (!config.llm.geminiKey) return [];

            logger.info(`Fetching latest news for ${symbol} via Gemini search...`);

            const prompt = `Find the 3 most recent and impactful news stories for the cryptocurrency pair ${symbol} from the last 24 hours. Provide only the news text, one per line. Focus on major announcements, whale movements, or regulatory news.`;

            const text = await this.callGemini(prompt, true);

            if (!text) {
                logger.warn(`No news found for ${symbol}`);
                return [];
            }

            const newsItems = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 20); // Filter out short fragments

            logger.info(`Found ${newsItems.length} news items for ${symbol}`);
            return newsItems;
        } catch (error) {
            logger.error('Failed to get latest news via Gemini', { error: error.message });
            return [];
        }
    }
}

export const sentimentAnalyzer = new SentimentAnalyzer();
export default sentimentAnalyzer;
