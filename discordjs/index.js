const { Client, GatewayIntentBits, REST, Routes, ApplicationCommandType } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
require('dotenv').config();

// Bot Configuration
const BOT_TOKEN = process.env.BOT_TOKEN; //obv your bot token 
const COMMANDS_TOKEN = process.env.COMMANDS_TK; // important, replace with your v1 token from top.gg
const APPLICATION_ID = process.env.APPLICATION_ID; //This can be removed  not needd 

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
            const commandData = {
                id: command.id,
                application_id: this.client.application.id,
                name: command.name,
                version: "1"
            };
            
            if (command.type === ApplicationCommandType.User || command.type === ApplicationCommandType.Message) {
                commandData.type = command.type;
                commandData.description = "";
            } else {
                commandData.type = 1;
                commandData.description = command.description || "No description";
                
                if (command.options && command.options.length > 0) {
                    commandData.options = command.options.map(option => this.convertOptionToTopGGFormat(option));
                }
            }
            
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
        
        if (option.choices && option.choices.length > 0) {
            optionData.choices = option.choices;
        }
        
        if (option.options && option.options.length > 0) {
            optionData.options = option.options.map(subOption => this.convertOptionToTopGGFormat(subOption));
        }
        
        return optionData;
    }

    async startPeriodicUpdates() {
        this.periodicCommandsInterval = setInterval(async () => {
            try {
                await this.postCommandsToTopGG();
            } catch (error) {
                logger.error(`❌ Error in periodic command update: ${error.message}`);
            }
        }, 86400000);
        
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
            
            let existingCommands = [];
            try {
                if (guildId) {
                    existingCommands = await rest.get(Routes.applicationGuildCommands(this.client.application.id, guildId));
                } else {
                    existingCommands = await rest.get(Routes.applicationCommands(this.client.application.id));
                }
                logger.info(`📋 Found ${existingCommands.length} existing commands`);

                let synced;
                if (guildId) {
                    synced = await rest.put(
                        Routes.applicationGuildCommands(this.client.application.id, guildId),
                        { body: existingCommands }
                    );
                    logger.info(`✅ Synced ${synced.length} commands to guild ${guildId}`);
                } else {
                    synced = await rest.put(
                        Routes.applicationCommands(this.client.application.id),
                        { body: existingCommands }
                    );
                    logger.info(`✅ Synced ${synced.length} commands globally`);
                }
                
                return synced.length;
            } catch (error) {
                logger.error(`❌ Error syncing commands: ${error.message}`);
                return 0;
            }
        } catch (error) {
            logger.error(`❌ Failed to sync commands: ${error.message}`);
            return 0;
        }
    }
}

// Basic command handling
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    // Handle existing commands from Entry Point or other sources
});

// Bot events
client.once('clientReady', async () => {
    logger.info(`🚀 Bot logged in as ${client.user.tag} (ID: ${client.user.id})`);
    logger.info(`📊 Connected to ${client.guilds.cache.size} guilds`);
    
    const topgg = new TopGGIntegration(client);
    const syncer = new CommandSyncer(client);
    
    try {
        const syncedCount = await syncer.syncCommands();
        logger.info(`✅ Command sync completed: ${syncedCount} commands`);
    } catch (error) {
        logger.error(`❌ Command sync failed: ${error.message}`);
        try {
            const existingCommands = await client.application.commands.fetch();
            logger.info(`📋 Found ${existingCommands.size} existing commands`);
        } catch (fetchError) {
            logger.error(`❌ Failed to fetch existing commands: ${fetchError.message}`);
        }
    }
    
    try {
        await topgg.startPeriodicUpdates();
        logger.info('✅ Top.gg integration started');
    } catch (error) {
        logger.error(`❌ Top.gg integration failed: ${error.message}`);
    }
    
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
    }, 2000);
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

// Main function
async function main() {
    if (!BOT_TOKEN) {
        logger.error('❌ BOT_TOKEN not found in environment variables');
        return;
    }
    
    if (!COMMANDS_TOKEN) {
        logger.warn('⚠️ COMMANDS_TK not found - Top.gg command updates disabled');
    }
    
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

main();
