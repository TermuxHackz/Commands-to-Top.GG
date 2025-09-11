# Discord.js Bot with Top.gg Integration

This is a Discord bot built with Discord.js that automatically posts bot commands to Top.gg every 24 hours. It's a JavaScript/Node.js conversion of the original Python version.

## Features

- 🤖 Discord bot with slash commands
- 📊 Top.gg API integration for command posting
- ⏰ Automatic command updates every 24 hours
- 📝 Comprehensive logging with daily rotation
- 🔧 Easy configuration with environment variables
- 🚀 Example commands (ping, info)

## Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn package manager
- Discord bot token
- Top.gg API token (optional, for command posting)

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd discordjs
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```

4. **Edit the `.env` file with your actual values:**
   ```env
   BOT_TOKEN=your_actual_discord_bot_token
   APPLICATION_ID=your_discord_application_id
   COMMANDS_TK=your_topgg_v1_token
   ```

## Configuration

### Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Go to the "Bot" section and create a bot
4. Copy the bot token and add it to your `.env` file as `BOT_TOKEN`
5. Copy the application ID from the "General Information" section and add it as `APPLICATION_ID`

### Top.gg API Setup (Optional)

1. Go to [Top.gg](https://top.gg/) and log in
2. Navigate to your bot's page or create a new bot listing
3. Go to the API section and generate a commands token
4. Add the token to your `.env` file as `COMMANDS_TK`

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## Project Structure

```
discordjs/
├── index.js              # Main bot file
├── package.json          # Project dependencies and scripts
├── .env.example          # Environment variables template
├── .env                  # Your actual environment variables (create this)
├── README.md             # This file
└── logs/                 # Log files (created automatically)
    └── bot-YYYY-MM-DD.log
```

## Key Components

### TopGGIntegration Class
- Handles posting commands to Top.gg API
- Converts Discord commands to Top.gg format
- Runs periodic updates every 24 hours

### CommandSyncer Class
- Syncs slash commands with Discord
- Supports both global and guild-specific syncing

### Logging
- Uses Winston for comprehensive logging
- Daily rotating log files
- Console and file output

## Commands

The bot includes two example slash commands:

- `/ping` - Check bot latency
- `/info` - Display bot information (servers, users, latency)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Discord bot token | Yes |
| `APPLICATION_ID` | Discord application ID | Yes |
| `COMMANDS_TK` | Top.gg commands API token | DUH!! |

## Logging

Logs are stored in the `logs/` directory with daily rotation. The bot logs:
- Startup and shutdown events
- Command synchronization
- Top.gg API interactions
- Guild join/leave events
- Errors and warnings

## Error Handling

The bot includes comprehensive error handling for:
- Invalid tokens
- API failures
- Command sync errors
- Unhandled promise rejections
- Uncaught exceptions

## Differences from Python Version

This JavaScript version maintains the same functionality as the original Python version but uses:
- Discord.js instead of discord.py
- Axios instead of aiohttp
- Winston for logging instead of Python's logging module
- setInterval for periodic tasks instead of asyncio
- Node.js environment variables instead of python-dotenv

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request


## Troubleshooting

### Common Issues

1. **Bot not starting:**
   - Check if `BOT_TOKEN` is set correctly
   - Ensure the token is valid and not expired

2. **Commands not syncing:**
   - Verify `APPLICATION_ID` matches your Discord application
   - Check bot permissions in your Discord server

3. **Top.gg integration not working:**
   - Ensure `COMMANDS_TK` is set and valid
   - Check if your bot is listed on Top.gg

4. **Permission errors:**
   - Make sure the bot has necessary permissions in Discord servers
   - Check if the bot can create slash commands
