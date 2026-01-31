#!/usr/bin/env node

/**
 * GEMINI CLI - TEST SYSTEM
 * 
 * Usage: 
 *   node bin/gemini-cli.js "find news about BTC"
 *   node bin/gemini-cli.js "is it a good time to buy SOL?"
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
dotenv.config({ path: join(__dirname, '../.env') });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

async function runQuery(query) {
    if (!GEMINI_KEY) {
        console.error(chalk.red('Error: GEMINI_API_KEY not found in .env file.'));
        process.exit(1);
    }

    const spinner = ora('Gemini is thinking...').start();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: query }] }],
                tools: [{ google_search: {} }]
            })
        });

        const data = await response.json();
        spinner.stop();

        if (data.error) {
            console.error(chalk.red(`\nGemini API Error: ${data.error.message}`));
            return;
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            console.log(chalk.blue('\n--- Gemini Response ---'));
            console.log(chalk.white(text));
            console.log(chalk.blue('-----------------------\n'));

            // Check for grounding metadata
            if (data.candidates?.[0]?.groundingMetadata) {
                console.log(chalk.gray('Sources used: Google Search'));
            }
        } else {
            console.log(chalk.yellow('\nGemini returned an empty response.'));
        }

    } catch (error) {
        spinner.stop();
        console.error(chalk.red(`\nRequest failed: ${error.message}`));
    }
}

const query = process.argv.slice(2).join(' ');

if (!query) {
    console.log(chalk.yellow('Usage: node bin/gemini-cli.js "your question here"'));
} else {
    runQuery(query);
}
