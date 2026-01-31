import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { riskManager } from '../engine/risk.js';
import fetch from 'node-fetch';

/**
 * Discord Integration
 * Handles notifications (via Webhook or Bot) and remote control commands
 */
class DiscordIntegration {
    constructor() {
        this.client = null;
        this.channel = null;
    }

    async init() {
        if (config.discord.webhookUrl) {
            logger.info('Discord Webhook configured for notifications.');
        }

        if (!config.discord.token || !config.discord.channelId) {
            if (!config.discord.webhookUrl) {
                logger.warn('No Discord bot token or Webhook URL found. Notifications disabled.');
            }
            return false;
        }

        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                ],
            });

            this.client.on('ready', async () => {
                logger.info(`Discord bot logged in as ${this.client.user.tag}`);
                this.channel = await this.client.channels.fetch(config.discord.channelId);
                this.sendAlert('🚀 Crypto Sentinel Bot is online and monitoring.');
            });

            this.client.on('messageCreate', (message) => this.handleCommand(message));

            await this.client.login(config.discord.token);
            return true;
        } catch (error) {
            logger.error('Discord login failed', { error: error.message });
            return false;
        }
    }

    async sendAlert(message, embed = null) {
        // 1. Send via Webhook if available
        if (config.discord.webhookUrl) {
            try {
                const body = { content: message };
                if (embed) {
                    body.embeds = [embed.toJSON ? embed.toJSON() : embed];
                }
                await fetch(config.discord.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } catch (error) {
                logger.error('Failed to send Discord webhook alert', { error: error.message });
            }
        }

        // 2. Send via Bot Channel if available
        if (this.channel) {
            try {
                if (embed) {
                    await this.channel.send({ content: message, embeds: [embed] });
                } else {
                    await this.channel.send(message);
                }
            } catch (error) {
                logger.error('Failed to send Discord bot alert', { error: error.message });
            }
        }
    }

    async sendTradeAlert(trade) {
        const color = trade.side === 'BUY' ? 0x00ff00 : 0xff0000;
        const embed = new EmbedBuilder()
            .setTitle(`Trade ${trade.side}: ${trade.symbol}`)
            .setColor(color)
            .addFields(
                { name: 'Price', value: `${trade.price} ${config.trading.baseCurrency}`, inline: true },
                { name: 'Quantity', value: `${trade.quantity}`, inline: true },
                { name: 'Reason', value: trade.reason || 'Momentum', inline: false }
            )
            .setTimestamp();

        await this.sendAlert('', embed);
    }

    async handleCommand(message) {
        if (message.author.bot) return;
        if (!message.content.startsWith('!')) return;

        // Security check: Only admins can run commands
        if (!config.discord.adminUserIds.includes(message.author.id)) {
            return message.reply('❌ Unauthorized. Your ID is not in the admin list.');
        }

        const [cmd, ...args] = message.content.slice(1).split(' ');

        switch (cmd.toLowerCase()) {
            case 'status':
                const stats = riskManager.dailyStats;
                const statusEmbed = new EmbedBuilder()
                    .setTitle('Bot Status Report')
                    .setColor(stats.isHalted ? 0xff0000 : 0x00ff00)
                    .addFields(
                        { name: 'Date', value: stats.date, inline: true },
                        { name: 'Status', value: stats.isHalted ? '🔴 HALTED' : '🟢 RUNNING', inline: true },
                        { name: 'Daily PnL', value: `${(stats.dailyPnL * 100).toFixed(2)}%`, inline: true },
                        { name: 'Trades Today', value: `${stats.tradesCount}`, inline: true },
                        { name: 'Current Balance', value: `${stats.currentBalance.toFixed(2)} USDT`, inline: true }
                    );
                message.channel.send({ embeds: [statusEmbed] });
                break;

            case 'pause':
                riskManager.dailyStats.isHalted = true;
                riskManager.saveStats();
                message.reply('⏸️ Bot trading paused manually.');
                break;

            case 'resume':
                riskManager.dailyStats.isHalted = false;
                riskManager.saveStats();
                message.reply('▶️ Bot trading resumed manually.');
                break;

            case 'kill':
                message.reply('💀 Shutting down bot...');
                process.exit(0);
                break;

            default:
                message.reply(`Unknown command: !${cmd}. Available: !status, !pause, !resume, !kill`);
        }
    }
}

export const discord = new DiscordIntegration();
export default discord;
