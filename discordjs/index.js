const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, ApplicationCommandType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
require('dotenv').config();

// Bot Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const COMMANDS_TOKEN = process.env.COMMANDS_TK; // Replace this with the name of your v1 token
const APPLICATION_ID = process.env.APPLICATION_ID;

// Setup logging
function setupLogging() {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message }) => {
                return `${timestamp} [${level.toUpperCase()}] ${message}`;
            })
        ),
        transports: [
            new winston.transports.Console(),
            new DailyRotateFile({
                filename: path.join(logsDir, 'bot-%DATE%.log'),
                datePattern: 'YYYY-MM-DD_HH-mm-ss',
                maxSize: '20m',
                maxFiles: '14d'
            })
        ]
    });

    return logger;
}

// Initialize logger
const logger = setupLogging();

// Initialize bot with proper intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

class TopGGIntegration {
    constructor(client) {
        this.client = client;
        this.commandsToken = COMMANDS_TOKEN;
    }

    async postCommandsToTopGG() {
        if (!this.commandsToken) {
            logger.error('Commands token not found. Set COMMANDS_TK in environment.');
            return false;
        }

        const url = 'https://top.gg/api/v1/projects/@me/commands';
        const headers = {
            'Authorization': `Bearer ${this.commandsToken}`,
            'Content-Type': 'application/json'
        };

        try {
            const commandsData = await this.getBotCommandsForTopGG();
            
            if (!commandsData || commandsData.length === 0) {
                logger.warn('⚠️ No commands found to post to Top.gg');
                return false;
            }

            const response = await axios.post(url, commandsData, { headers });
            
            if (response.status === 200 || response.status === 204) {
                logger.info(`✅ Successfully posted ${commandsData.length} commands to Top.gg`);
                return true;
            } else {
                logger.error(`❌ Failed to post commands to Top.gg: ${response.status} - ${response.data}`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Error posting commands to Top.gg: ${error.message}`);
            return false;
        }
    }

    async getBotCommandsForTopGG() {
        const commandsList = [];
        
        try {
            // Get all slash commands
            const commands = await this.client.application.commands.fetch();
            
            for (const [id, command] of commands) {
                try {
                    const commandData = await this.convertCommandToTopGGFormat(command);
                    if (commandData) {
                        commandsList.push(commandData);
                    }
                } catch (error) {
                    logger.error(`❌ Error converting command ${command.name}: ${error.message}`);
                }
            }
            
            return commandsList;
        } catch (error) {
            logger.error(`❌ Error fetching bot commands: ${error.message}`);
            return [];
        }
    }

    async convertCommandToTopGGFormat(command) {
        try {
            // Base command structure
            const commandData = {
                id: command.id,
                application_id: this.client.application.id,
                name: command.name,
                version: "1"
            };
            
            // Handle different command types
            if (command.type === ApplicationCommandType.User || command.type === ApplicationCommandType.Message) {
                // Context menu commands
                commandData.type = command.type;
                commandData.description = "";
            } else {
                // Regular slash commands
                commandData.type = 1; // CHAT_INPUT
                commandData.description = command.description || "No description";
                
                // Add options if any
                if (command.options && command.options.length > 0) {
                    commandData.options = command.options.map(option => this.convertOptionToTopGGFormat(option));
                }
            }
            
            // Add permissions if specified
            if (command.defaultMemberPermissions) {
                commandData.default_member_permissions = command.defaultMemberPermissions.toString();
            }
            
            return commandData;
            
        } catch (error) {
            logger.error(`❌ Error converting command ${command.name} to Top.gg format: ${error.message}`);
            return null;
        }
    }

    convertOptionToTopGGFormat(option) {
        const optionData = {
            name: option.name,
            description: option.description || 'Parameter',
            type: option.type,
            required: option.required || false
        };
        
        // Add choices if any
        if (option.choices && option.choices.length > 0) {
            optionData.choices = option.choices;
        }
        
        // Add sub-options for subcommands and subcommand groups
        if (option.options && option.options.length > 0) {
            optionData.options = option.options.map(subOption => this.convertOptionToTopGGFormat(subOption));
        }
        
        return optionData;
    }

    async startPeriodicUpdates() {
        // Start command updates (every 24 hours)
        this.periodicCommandsInterval = setInterval(async () => {
            try {
                await this.postCommandsToTopGG();
            } catch (error) {
                logger.error(`❌ Error in periodic command update: ${error.message}`);
            }
        }, 86400000); // 24 hours in milliseconds
        
        logger.info('✅ Started periodic Top.gg command updates (every 24 hours)');
    }

    stopPeriodicUpdates() {
        if (this.periodicCommandsInterval) {
            clearInterval(this.periodicCommandsInterval);
            logger.info('🛑 Stopped periodic Top.gg command updates');
        }
    }
}

class CommandSyncer {
    constructor(client) {
        this.client = client;
    }

    async syncCommands(guildId = null) {
        try {
            const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
            
            // First, get existing commands to preserve Entry Point commands
            let existingCommands = [];
            try {
                if (guildId) {
                    existingCommands = await rest.get(Routes.applicationGuildCommands(this.client.application.id, guildId));
                } else {
                    existingCommands = await rest.get(Routes.applicationCommands(this.client.application.id));
                }
                logger.info(`📋 Found ${existingCommands.length} existing commands`);
            } catch (fetchError) {
                logger.warn(`⚠️ Could not fetch existing commands: ${fetchError.message}`);
            }
            
            // Define new commands we want to add/update
            const newCommands = [
                new SlashCommandBuilder()
                    .setName('ping')
                    .setDescription('Check bot latency'),
                new SlashCommandBuilder()
                    .setName('info')
                    .setDescription('Get bot information')
            ].map(command => command.toJSON());

            // Merge existing commands with new ones, avoiding duplicates
            const allCommands = [...existingCommands];
            
            for (const newCmd of newCommands) {
                const existingIndex = allCommands.findIndex(cmd => cmd.name === newCmd.name);
                if (existingIndex >= 0) {
                    // Update existing command
                    allCommands[existingIndex] = newCmd;
                    logger.info(`🔄 Updating existing command: ${newCmd.name}`);
                } else {
                    // Add new command
                    allCommands.push(newCmd);
                    logger.info(`➕ Adding new command: ${newCmd.name}`);
                }
            }

            let synced;
            if (guildId) {
                // Sync to specific guild (faster for testing)
                synced = await rest.put(
                    Routes.applicationGuildCommands(this.client.application.id, guildId),
                    { body: allCommands }
                );
                logger.info(`✅ Synced ${synced.length} commands to guild ${guildId}`);
            } else {
                // Sync globally (takes up to 1 hour to propagate)
                synced = await rest.put(
                    Routes.applicationCommands(this.client.application.id),
                    { body: allCommands }
                );
                logger.info(`✅ Synced ${synced.length} commands globally`);
            }
            
            return synced.length;
            
        } catch (error) {
            logger.error(`❌ Failed to sync commands: ${error.message}`);
            
            // If sync fails due to Entry Point command, try individual command creation
            if (error.message.includes('Entry Point')) {
                logger.info('🔄 Attempting individual command registration...');
                return await this.createCommandsIndividually(guildId);
            }
            
            return 0;
        }
    }

    async createCommandsIndividually(guildId = null) {
        try {
            const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
            
            const commands = [
                new SlashCommandBuilder()
                    .setName('ping')
                    .setDescription('Check bot latency'),
                new SlashCommandBuilder()
                    .setName('info')
                    .setDescription('Get bot information')
            ];

            let createdCount = 0;
            
            for (const command of commands) {
                try {
                    if (guildId) {
                        await rest.post(
                            Routes.applicationGuildCommands(this.client.application.id, guildId),
                            { body: command.toJSON() }
                        );
                    } else {
                        await rest.post(
                            Routes.applicationCommands(this.client.application.id),
                            { body: command.toJSON() }
                        );
                    }
                    logger.info(`✅ Created command: ${command.name}`);
                    createdCount++;
                } catch (cmdError) {
                    if (cmdError.message.includes('already exists')) {
                        logger.info(`ℹ️ Command ${command.name} already exists, skipping`);
                    } else {
                        logger.error(`❌ Failed to create command ${command.name}: ${cmdError.message}`);
                    }
                }
            }
            
            return createdCount;
            
        } catch (error) {
            logger.error(`❌ Failed to create commands individually: ${error.message}`);
            return 0;
        }
    }
}

// Example commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'ping') {
        const latency = Math.round(client.ws.ping);
        await interaction.reply(`🏓 Pong! Latency: ${latency}ms`);
    } else if (commandName === 'info') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Information')
            .setDescription('A Discord bot with Top.gg integration')
            .setColor(0x0099FF)
            .addFields(
                { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
                { name: 'Users', value: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0).toString(), inline: true },
                { name: 'Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
            );
        
        await interaction.reply({ embeds: [embed] });
    }
});

// Bot events - Use clientReady instead of ready to avoid deprecation warning
client.once('clientReady', async () => {
    logger.info(`🚀 Bot logged in as ${client.user.tag} (ID: ${client.user.id})`);
    logger.info(`📊 Connected to ${client.guilds.cache.size} guilds`);
    
    // Initialize integrations
    const topgg = new TopGGIntegration(client);
    const syncer = new CommandSyncer(client);
    
    // Sync commands
    try {
        const syncedCount = await syncer.syncCommands();
        logger.info(`✅ Command sync completed: ${syncedCount} commands`);
    } catch (error) {
        logger.error(`❌ Command sync failed: ${error.message}`);
        // Try to get existing commands instead of syncing new ones
        try {
            const existingCommands = await client.application.commands.fetch();
            logger.info(`📋 Found ${existingCommands.size} existing commands`);
        } catch (fetchError) {
            logger.error(`❌ Failed to fetch existing commands: ${fetchError.message}`);
        }
    }
    
    // Start Top.gg integration
    try {
        await topgg.startPeriodicUpdates();
        logger.info('✅ Top.gg integration started');
    } catch (error) {
        logger.error(`❌ Top.gg integration failed: ${error.message}`);
    }
    
    // Post initial commands (with delay to ensure commands are ready)
    setTimeout(async () => {
        try {
            await topgg.postCommandsToTopGG();
            logger.info('✅ Initial Top.gg commands posted');
        } catch (error) {
            logger.error(`❌ Failed to post initial Top.gg commands: ${error.message}`);
            if (error.message.includes('401')) {
                logger.error('❌ Top.gg authentication failed. Please check your COMMANDS_TK token.');
                logger.info('💡 Make sure your Top.gg token has the correct permissions and is not expired.');
            }
        }
    }, 2000); // Wait 2 seconds for commands to be fully registered
});

client.on('guildCreate', guild => {
    logger.info(`📈 Joined guild: ${guild.name} (ID: ${guild.id})`);
});

client.on('guildDelete', guild => {
    logger.info(`📉 Left guild: ${guild.name} (ID: ${guild.id})`);
});

// Error handling
client.on('error', error => {
    logger.error(`❌ Client error: ${error.message}`);
});

process.on('unhandledRejection', error => {
    logger.error(`❌ Unhandled promise rejection: ${error.message}`);
});

process.on('uncaughtException', error => {
    logger.error(`❌ Uncaught exception: ${error.message}`);
    process.exit(1);
});

// Main function to start the bot
async function main() {
    // Validate environment variables
    if (!BOT_TOKEN) {
        logger.error('❌ BOT_TOKEN not found in environment variables');
        return;
    }
    
    if (!COMMANDS_TOKEN) {
        logger.warn('⚠️ COMMANDS_TK not found - Top.gg command updates disabled');
    }
    
    // Start the bot
    try {
        logger.info('🚀 Starting bot...');
        await client.login(BOT_TOKEN);
    } catch (error) {
        if (error.code === 'TOKEN_INVALID') {
            logger.error('❌ Invalid bot token');
        } else {
            logger.error(`❌ Failed to start bot: ${error.message}`);
        }
    }
}

// Run the bot
main();
