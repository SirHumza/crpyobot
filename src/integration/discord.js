import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config, updateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { riskManager } from '../engine/risk.js';
import fetch from 'node-fetch';

/**
 * Discord Integration (Slash Commands Edition)
 * Handles notifications, remote control, and configuration via proper UI.
 */
class DiscordIntegration {
    constructor() {
        this.client = null;
        this.channel = null;
    }

    async init() {
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

                // Register Slash Commands
                await this.registerGlobalCommands();

                this.sendAlert('🚀 **Sentinel Upgraded.** Slash commands enabled. monitoring active.');
            });

            this.client.on('interactionCreate', (interaction) => this.handleInteraction(interaction));

            await this.client.login(config.discord.token);
            return true;
        } catch (error) {
            logger.error('Discord login failed', { error: error.message });
            return false;
        }
    }

    /**
     * Register Slash Commands with Discord API
     */
    async registerGlobalCommands() {
        if (!this.client.application) return;

        const commands = [
            new SlashCommandBuilder()
                .setName('status')
                .setDescription('Show detailed bot status and PnL'),

            new SlashCommandBuilder()
                .setName('pause')
                .setDescription('Pause all trading activities'),

            new SlashCommandBuilder()
                .setName('resume')
                .setDescription('Resume trading activities'),

            new SlashCommandBuilder()
                .setName('config')
                .setDescription('Manage bot configuration')
                .addSubcommand(sub =>
                    sub.setName('view').setDescription('View current configuration'))
                .addSubcommand(sub =>
                    sub.setName('set')
                        .setDescription('Update a setting')
                        .addStringOption(opt =>
                            opt.setName('key')
                                .setDescription('Config key (e.g., risk.maxRiskPerTrade)')
                                .setRequired(true))
                        .addStringOption(opt =>
                            opt.setName('value')
                                .setDescription('New value')
                                .setRequired(true))),

            new SlashCommandBuilder()
                .setName('analyze')
                .setDescription('Ask AI to analyze a coin immediately')
                .addStringOption(opt =>
                    opt.setName('symbol')
                        .setDescription('Coin symbol (e.g. BTCUSDT)')
                        .setRequired(true)),

            new SlashCommandBuilder()
                .setName('help')
                .setDescription('Show available commands guide')
        ];

        try {
            logger.info('Refreshing application (/) commands...');
            const rest = new REST().setToken(config.discord.token);

            // Register for the specific Guild (Faster updates)
            // If you want global commands (takes 1 hour), use applicationCommands(clientId)
            // But usually we just want it for our server
            // Since we don't have guildId in config, we'll try global application commands.
            await rest.put(
                Routes.applicationCommands(this.client.user.id),
                { body: commands.map(c => c.toJSON()) },
            );

            logger.info('Successfully reloaded application (/) commands.');
        } catch (error) {
            logger.error('Failed to register commands', { error: error.message });
        }
    }

    async handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return;

        // Security: Only admins
        if (!config.discord.adminUserIds.includes(interaction.user.id)) {
            return interaction.reply({ content: '❌ **Access Denied.** You are not an admin.', ephemeral: true });
        }

        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'status':
                    await this.handleStatus(interaction);
                    break;
                case 'pause':
                    await this.handlePause(interaction);
                    break;
                case 'resume':
                    await this.handleResume(interaction);
                    break;
                case 'config':
                    await this.handleConfig(interaction);
                    break;
                case 'analyze':
                    await this.handleAnalyze(interaction);
                    break;
                case 'help':
                    await this.handleHelp(interaction);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown command', ephemeral: true });
            }
        } catch (error) {
            logger.error('Interaction failed', { error: error.message });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred while executing this command.', ephemeral: true });
            }
        }
    }

    async handleAnalyze(interaction) {
        const symbol = interaction.options.getString('symbol').toUpperCase();
        await interaction.deferReply(); // AI takes time

        try {
            // Import analyze function dynamically to avoid circular dep if possible, or assume it's available via engine
            // For now, we will use Gemini directly or fail gracefully if engine isn't exposed
            // A better way: Just simulate the "News check" logic

            const { getNewsSentiment } = await import('../signal/sentiment.js');
            const { binance } = await import('../exchange/binance.js');

            const price = await binance.getPrice(symbol);
            const sentiment = await getNewsSentiment([symbol]);
            const score = sentiment[symbol]?.score || 0;
            const explanation = sentiment[symbol]?.explanation || 'No data';

            const embed = new EmbedBuilder()
                .setTitle(`🧠 AI Analysis: ${symbol}`)
                .setColor(score > 60 ? 0x00ff00 : (score < 40 ? 0xff0000 : 0xffff00))
                .addFields(
                    { name: 'Current Price', value: `$${price}`, inline: true },
                    { name: 'AI Score', value: `${score}/100`, inline: true },
                    { name: 'Verdict', value: score > 75 ? '🚀 BUY' : (score < 30 ? '🔻 SELL' : '👀 WATCH'), inline: true },
                    { name: 'Reasoning', value: explanation }
                );

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await interaction.editReply(`❌ Analysis failed: ${error.message}`);
        }
    }

    async handleStatus(interaction) {
        const stats = riskManager.dailyStats;
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Sentinel Status Report')
            .setColor(stats.isHalted ? 0xff0000 : 0x00ff00)
            .addFields(
                { name: 'Status', value: stats.isHalted ? '🔴 **HALTED**' : '🟢 **RUNNING**', inline: true },
                { name: 'Balance', value: `$${stats.currentBalance.toFixed(2)}`, inline: true },
                { name: 'Daily PnL', value: `${(stats.dailyPnL * 100).toFixed(2)}%`, inline: true },
                { name: 'Trades Today', value: `${stats.tradesCount}`, inline: true },
                { name: 'Open Trades', value: `${riskManager.openTrades.length}`, inline: true }
            )
            .setFooter({ text: `Date: ${stats.date}` });

        await interaction.reply({ embeds: [embed] });
    }

    async handlePause(interaction) {
        riskManager.dailyStats.isHalted = true;
        riskManager.saveStats();
        await interaction.reply('⏸️ **Bot Paused.** No new trades will be opened.');
    }

    async handleResume(interaction) {
        riskManager.dailyStats.isHalted = false;
        riskManager.saveStats();
        await interaction.reply('▶️ **Bot Resumed.** Trading active.');
    }

    async handleConfig(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            // Flatten config for display (simplified)
            const riskConfig = Object.entries(config.risk).map(([k, v]) => `${k}: ${v}`).join('\n');
            const technicals = Object.entries(config.technicals).map(([k, v]) => `${k}: ${v}`).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Current Configuration')
                .setColor(0x0099ff)
                .addFields(
                    { name: 'Risk', value: `\`\`\`yaml\n${riskConfig}\n\`\`\`` },
                    { name: 'Technicals', value: `\`\`\`yaml\n${technicals}\n\`\`\`` }
                );
            await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'set') {
            const key = interaction.options.getString('key');
            const value = interaction.options.getString('value');

            const success = updateConfig(key, value);
            if (success) {
                await interaction.reply(`✅ Updated **${key}** to \`${value}\``);
                logger.info(`Config updated via Discord: ${key} = ${value}`);
            } else {
                await interaction.reply(`❌ Failed to update **${key}**. Key not found or invalid.`);
            }
        }
    }

    async handleHelp(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Commands Guide')
            .setColor(0x00ff00)
            .addFields(
                { name: '/status', value: 'Check PnL and health' },
                { name: '/pause', value: 'Emergency stop' },
                { name: '/resume', value: 'Restart trading' },
                { name: '/config view', value: 'See settings' },
                { name: '/config set [key] [value]', value: 'Change settings (e.g. `risk.maxRiskPerTrade 0.05`)' }
            );
        await interaction.reply({ embeds: [embed] });
    }

    async sendAlert(message, embed = null) {
        // Fallback for non-interaction updates (like trade alerts)
        if (this.channel) {
            try {
                if (embed) {
                    await this.channel.send({ content: message, embeds: [embed] });
                } else {
                    await this.channel.send(message);
                }
            } catch (error) {
                logger.error('Failed to send Discord alert', { error: error.message });
            }
        }
    }

    /**
     * Broadcast a critical error to Discord
     */
    async broadcastError(error) {
        if (!this.channel) return;
        try {
            const embed = new EmbedBuilder()
                .setTitle('🚨 Critical Error')
                .setColor(0xff0000)
                .setDescription(`\`\`\`${error.message || error}\`\`\``)
                .setTimestamp();
            await this.channel.send({ content: '<@' + config.discord.adminUserIds[0] + '>', embeds: [embed] });
        } catch (e) {
            // Fail silently if we can't report the error
        }
    }

    // Adapt old method signatures if still used
    async sendTradeAlert(trade) {
        const color = trade.side === 'BUY' ? 0x00ff00 : 0xff0000;
        const embed = new EmbedBuilder()
            .setTitle(`Trade ${trade.side}: ${trade.symbol}`)
            .setColor(color)
            .addFields(
                { name: 'Price', value: `${trade.price}`, inline: true },
                { name: 'Qty', value: `${trade.quantity}`, inline: true },
                { name: 'Reason', value: trade.reason || 'Momentum', inline: false }
            )
            .setTimestamp();
        await this.sendAlert('', embed);
    }
}

export const discord = new DiscordIntegration();
export default discord;
