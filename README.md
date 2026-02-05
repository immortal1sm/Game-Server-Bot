# Game-Server-Bot
Discord bot that lets trusted users start, stop, restart, and check status of game servers using slash commands, using Docker and shell scripts.

> **Disclaimer**: This bot does not allow arbitrary command execution or direct Docker access. It is strictly limited to predefined containers and shell scripts. Setup is intentionally more involved than typical Discord bots to prioritize safety and control.

##  Features

- **Slash Commands Only** (\`/server up | down | restart | status\`)
- **Restricted to One Discord Channel** for better security
- **Confirmation Required** for destructive actions (down/restart)
- **No Raw Shell Access** - users never touch the command line
- **Easy to Extend** - add your own servers with minimal configuration

##  Architecture Overview

```
Discord → Bot Container → Shell Scripts → Docker Engine → Game Servers
```

- Discord users never touch the shell directly
- The bot only executes predefined \`.sh\` scripts
- Scripts control Docker containers by name
- All communication is secured and validated

##  Quick Start

### 1️⃣ Prerequisites

- **Docker** and **Docker Compose** installed on your host
- A **Discord account** with server management permissions

### 2️⃣ Create Your Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** and give it a name
3. Navigate to the **"Bot"** section and create a bot
4. Copy these credentials:
   - **Bot Token** (from Bot section)
   - **Application (Client) ID** (from General Information)
   - **Guild (Server) ID** (Enable Developer Mode → Right-click server → Copy ID)

5. Invite the bot to your server with these permissions:
   ```sample
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=0&scope=bot%20applications.commands
   ```

### 3️⃣ Configure Your Game Servers

#### Create Control Scripts Directory
```bash
sudo mkdir -p /opt/server-control
```

#### Example Script for Icarus Server
```bash
sudo nano /opt/server-control/icarus-up.sh
```
```sh
#!/bin/sh
set -e
docker start icarus-dedicated
```

#### Create Additional Scripts
Repeat for each action:
- \`icarus-down.sh\` → \`docker stop icarus-dedicated\`
- \`icarus-restart.sh\` → \`docker restart icarus-dedicated\`
- \`sotf-up.sh\` → \`docker start sotf-dedicated\`
- \`sotf-down.sh\` → \`docker stop sotf-dedicated\`
- \`sotf-restart.sh\` → \`docker restart sotf-dedicated\`

#### Set Script Permissions
```bash
sudo chmod +x /opt/server-control/*.sh
```

### 4️⃣ Project Structure

```
discord-server-controller/
├── docker-compose.yml    # Main deployment configuration
├── Dockerfile           # Bot container definition
├── bot.js              # Bot logic
├── package.json        # Node.js dependencies
└── README.md           # This file
```

### 5️⃣ Docker Compose Configuration

**\`docker-compose.yml\`** - No \`.env\` file required, all config embedded:

```yaml
version: '\''3.8'\''

services:
  discord-bot:
    build: .
    container_name: discord-bot
    environment:
      DISCORD_TOKEN: "PASTE_YOUR_BOT_TOKEN_HERE"
      CLIENT_ID: "PASTE_YOUR_APPLICATION_ID_HERE"
      GUILD_ID: "PASTE_YOUR_DISCORD_SERVER_ID_HERE"
      CONTROL_CHANNEL: "server-control"
    volumes:
      - /opt/server-control:/opt/server-control:ro
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
```

### 6️⃣ Bot Configuration

**\`bot.js\`** - Customize your servers:

```javascript
/* ───────── Server Definitions ───────── */
const SERVERS = {
  icarus: {
    name: "Icarus Server",
    container: "icarus-dedicated",
    scripts: {
      up: "/opt/server-control/icarus-up.sh",
      down: "/opt/server-control/icarus-down.sh",
      restart: "/opt/server-control/icarus-restart.sh"
    }
  },
  sotf: {
    name: "Sons of the Forest Server",
    container: "sotf-dedicated",
    scripts: {
      up: "/opt/server-control/sotf-up.sh",
      down: "/opt/server-control/sotf-down.sh",
      restart: "/opt/server-control/sotf-restart.sh"
    }
  }
  // Add more servers here...
};
```

### 7️⃣ Dockerfile

**\`Dockerfile\`** - Container definition:

```dockerfile
# Base image
FROM node:20-alpine

# Install Docker CLI
USER root
RUN apk add --no-cache docker-cli bash curl

# Create working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy bot code
COPY bot.js ./

# Create non-root user and switch
RUN adduser -D botuser
USER botuser

# Default command
CMD ["node", "bot.js"]
```

### 8️⃣ Package.json

**\`package.json\`** - Dependencies:

```json
{
  "name": "discord-server-controller",
  "version": "1.0.0",
  "description": "Discord bot for controlling game servers via Docker",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "child_process": "^1.0.2"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 9️⃣ Deploy the Bot

```bash
# Build and start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down
```

## 📖 Discord Usage Guide

1. **Create a channel** named \`#server-control\` (or change \`CONTROL_CHANNEL\` in config)
2. **Commands available**:
   ```
   /icarus up        # Start Icarus server
   /icarus down      # Stop Icarus server (requires confirmation)
   /icarus restart   # Restart Icarus server (requires confirmation)
   /icarus status    # Check Icarus server status
   
   /sotf up          # Start Sons of the Forest server
   /sotf down        # Stop SOTF server (requires confirmation)
   /sotf restart     # Restart SOTF server (requires confirmation)
   /sotf status      # Check SOTF server status
   ```
3. **Only works** in the designated control channel
4. **Down & restart** commands require button confirmation
5. **No free-form commands** allowed

## 🔐 Security Model

- **Slash commands only** - no arbitrary text commands
- **No shell input from users** - users can'\''t execute custom commands
- **Read-only scripts** - bot cannot modify control scripts
- **Docker socket access** - limited to executing predefined scripts
- **Channel restrictions** - commands only work in specified channel
- **Confirmation prompts** - for destructive actions
- **No \`eval()\` or raw shell strings** - only \`execFile()\` with predefined paths

## 🧩 Extending the Bot

### Adding a New Server

1. **Create control scripts** in \`/opt/server-control/\`:
   ```bash
   # Example for Minecraft server
   echo '\''#!/bin/sh
   docker start minecraft-server'\'' | sudo tee /opt/server-control/minecraft-up.sh
   sudo chmod +x /opt/server-control/minecraft-*.sh
   ```

2. **Add server configuration** in \`bot.js\`:
   ```javascript
   const SERVERS = {
     // ... existing servers ...
     minecraft: {
       name: "Minecraft Server",
       container: "minecraft-server",
       scripts: {
         up: "/opt/server-control/minecraft-up.sh",
         down: "/opt/server-control/minecraft-down.sh",
         restart: "/opt/server-control/minecraft-restart.sh"
       }
     }
   };
   ```

3. **Restart the bot**:
   ```bash
   docker compose restart
   ```

### Customizing Existing Servers

- **Change server names**: Update the \`name\` property in \`SERVERS\` object
- **Change container names**: Update the \`container\` property
- **Change script paths**: Update the \`scripts\` paths
- **Add more actions**: Modify the slash command options in \`bot.js\`

## 🐛 Troubleshooting

### Common Issues

**Bot doesn'\''t respond to commands:**
- Check if commands are registered: \`docker-compose logs discord-bot | grep "Commands"\`
- Verify the bot has proper permissions in Discord
- Ensure you'\''re using commands in the correct channel

**"Wrong channel" error:**
- Create a channel named \`server-control\` (or update \`CONTROL_CHANNEL\` in config)
- Ensure the bot has access to that channel

**"Script not found" error:**
- Verify script paths in \`/opt/server-control/\`
- Check file permissions: \`sudo chmod +x /opt/server-control/*.sh\`
- Ensure scripts are mounted in docker-compose.yml

**Docker commands fail:**
- Verify the host'\''s Docker socket is mounted correctly
- Check if the bot user has permissions to execute Docker commands

### Logs & Debugging

```bash
# View bot logs
docker compose logs -f discord-bot

# Check bot container status
docker compose ps

# Restart the bot
docker compose restart discord-bot

# Rebuild and restart
docker compose up -d --build
```

## 🤝 Contributing

Feel free to fork this project and submit pull requests with improvements:
- Additional security features
- More server types
- Better error handling
- UI/UX improvements

## ⚠️ Disclaimer

This bot provides administrative control over your game servers. Use responsibly:
- Keep your bot token secure
- Only grant access to trusted users
- Regularly update dependencies
- Monitor bot logs for unusual activity

---

**Ready to deploy?** Start with [Step 1: Create Your Discord Bot](#1️⃣-create-your-discord-bot) above!' > README.md
