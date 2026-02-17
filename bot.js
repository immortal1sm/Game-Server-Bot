const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require("discord.js");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    CONTROL_CHANNEL
} = process.env;

/* ───────── Server Definitions ───────── */
const SERVERS = {
    icarus: {
        name: "Icarus Dedicated Server",
        container: "icarus-dedicated",
        scripts: {
            up: "/opt/server-control/icarus-up.sh",
            down: "/opt/server-control/icarus-down.sh",
            restart: "/opt/server-control/icarus-restart.sh"
        }
    },
    sotf: {
        name: "Sons of the Forest Server",
        container: "sotf",
        scripts: {
            up: "/opt/server-control/sotf-up.sh",
            down: "/opt/server-control/sotf-down.sh",
            restart: "/opt/server-control/sotf-restart.sh"
        }
    }
    // Add more servers here following the same pattern
};

/* ───────── Slash Commands ───────── */
const commands = Object.keys(SERVERS).map(key =>
    new SlashCommandBuilder()
        .setName(key)
        .setDescription(`Control ${SERVERS[key].name}`)
        .addStringOption(opt =>
            opt.setName("action")
                .setDescription("Action to perform")
                .setRequired(true)
                .addChoices(
                    { name: "up", value: "up" },
                    { name: "down", value: "down" },
                    { name: "restart", value: "restart" },
                    { name: "status", value: "status" }
                )
        ).toJSON()
);

/* ───────── Register Commands ───────── */
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log("Registering slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log("✅ Slash commands registered successfully!");
        console.log(`📝 Registered ${commands.length} commands:`);
        commands.forEach(cmd => {
            console.log(`   /${cmd.name} [action]`);
        });
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
})();

/* ───────── Discord Client ───────── */
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Fixed: Changed 'ready' to 'clientReady' to eliminate deprecation warning
client.once("clientReady", () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📝 Monitoring channel: #${CONTROL_CHANNEL}`);
});

/* ───────── Helper Functions for Enhanced Status ───────── */

/**
 * Get container uptime in a human-readable format
 */
async function getContainerUptime(containerName) {
    try {
        const { stdout } = await execFileAsync("docker", [
            "inspect",
            "--format={{.State.StartedAt}}",
            containerName
        ]);

        const startedAt = new Date(stdout.trim());
        const now = new Date();
        const uptimeMs = now - startedAt;

        // Calculate uptime components
        const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

        return parts.join(' ');
    } catch (error) {
        return "N/A";
    }
}

/**
 * Get container CPU usage percentage
 */
async function getContainerCPU(containerName) {
    try {
        // Get CPU stats using docker stats (single snapshot)
        const { stdout } = await execFileAsync("docker", [
            "stats",
            containerName,
            "--no-stream",
            "--format",
            "{{.CPUPerc}}"
        ]);

        return stdout.trim() || "0%";
    } catch (error) {
        return "N/A";
    }
}

/**
 * Get container memory usage
 */
async function getContainerMemory(containerName) {
    try {
        const { stdout } = await execFileAsync("docker", [
            "stats",
            containerName,
            "--no-stream",
            "--format",
            "{{.MemUsage}}"
        ]);

        return stdout.trim() || "N/A";
    } catch (error) {
        return "N/A";
    }
}

/**
 * Get detailed container status with metrics
 */
async function getDetailedContainerStatus(containerName) {
    try {
        // Get basic container state
        const { stdout: stateStdout } = await execFileAsync("docker", [
            "inspect",
            "--format={{.State.Status}}",
            containerName
        ]);

        const status = stateStdout.trim();

        // If container is not running, return basic info
        if (status !== "running") {
            return {
                status,
                uptime: "N/A",
                cpu: "N/A",
                memory: "N/A",
                isRunning: false
            };
        }

        // Get all stats in parallel for better performance
        const [uptime, cpu, memory] = await Promise.all([
            getContainerUptime(containerName),
            getContainerCPU(containerName),
            getContainerMemory(containerName)
        ]);

        return {
            status,
            uptime,
            cpu,
            memory,
            isRunning: true
        };
    } catch (error) {
        console.error(`Error getting container status for ${containerName}:`, error);
        return {
            status: "unknown",
            uptime: "N/A",
            cpu: "N/A",
            memory: "N/A",
            isRunning: false
        };
    }
}

/* ───────── Command Handler ───────── */
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Channel restriction check
    if (interaction.channel.name !== CONTROL_CHANNEL) {
        return interaction.reply({
            content: `❌ This bot only works in the **#${CONTROL_CHANNEL}** channel.`,
            ephemeral: true
        });
    }

    const serverKey = interaction.commandName;
    const server = SERVERS[serverKey];
    const action = interaction.options.getString("action");

    if (!server) {
        return interaction.reply({
            content: "❌ Server configuration not found.",
            ephemeral: true
        });
    }

    try {
        // Handle status check with enhanced information
        if (action === "status") {
            await interaction.deferReply(); // Defer reply while we gather stats

            const details = await getDetailedContainerStatus(server.container);

            // Determine emoji based on status
            let emoji = "❓";
            if (details.status === "running") emoji = "🟢";
            else if (details.status === "exited") emoji = "🔴";
            else if (details.status === "restarting") emoji = "🟡";
            else if (details.status === "paused") emoji = "🟠";

            // Create rich embed for status display - removed container name for security
            const embed = new EmbedBuilder()
                .setColor(details.isRunning ? 0x00FF00 : 0xFF0000)
                .setTitle(`${emoji} ${server.name} - Status`)
                .addFields(
                    { name: "State", value: `\`\`\`${details.status}\`\`\``, inline: true },
                    { name: "Uptime", value: `\`\`\`${details.uptime}\`\`\``, inline: true },
                    { name: "CPU Usage", value: `\`\`\`${details.cpu}\`\`\``, inline: true },
                    { name: "Memory Usage", value: `\`\`\`${details.memory}\`\`\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Requested by ${interaction.user.tag}` });

            // Add a note if server is not running
            if (!details.isRunning) {
                embed.setDescription(`⚠️ **Server is not running. Use the \`up\` action to start it.**`);
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // Handle start command - now automatically shows status after execution
        if (action === "up") {
            await interaction.deferReply(); // Defer in case script takes time
            await execFileAsync(server.scripts.up);

            // Automatically fetch and display status after starting
            const details = await getDetailedContainerStatus(server.container);

            // Determine emoji based on status
            let emoji = "❓";
            if (details.status === "running") emoji = "🟢";
            else if (details.status === "exited") emoji = "🔴";
            else if (details.status === "restarting") emoji = "🟡";
            else if (details.status === "paused") emoji = "🟠";

            // Create rich embed for status display
            const embed = new EmbedBuilder()
                .setColor(details.isRunning ? 0x00FF00 : 0xFF0000)
                .setTitle(`${emoji} ${server.name} - Status After Start`)
                .addFields(
                    { name: "State", value: `\`\`\`${details.status}\`\`\``, inline: true },
                    { name: "Uptime", value: `\`\`\`${details.uptime}\`\`\``, inline: true },
                    { name: "CPU Usage", value: `\`\`\`${details.cpu}\`\`\``, inline: true },
                    { name: "Memory Usage", value: `\`\`\`${details.memory}\`\`\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Started by ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [embed] });
        }

        // Handle destructive actions (require confirmation) - now shows status after execution
        if (action === "down" || action === "restart") {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("confirm_yes")
                    .setLabel("Yes, proceed")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("confirm_no")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary)
            );

            const warningMessage = action === "down"
                ? "⚠️ **WARNING**: This will stop the server and disconnect all players!"
                : "⚠️ **WARNING**: This will restart the server and disconnect all players!";

            await interaction.reply({
                content: `${warningMessage}\n\nAre you sure you want to **${action.toUpperCase()}** the **${server.name}**?`,
                components: [row],
                ephemeral: false
            });

            // Wait for confirmation
            try {
                const confirmation = await interaction.channel.awaitMessageComponent({
                    filter: (i) => i.user.id === interaction.user.id,
                    time: 30000 // 30 seconds
                });

                if (confirmation.customId === "confirm_no") {
                    await confirmation.update({
                        content: "❎ Action cancelled.",
                        components: []
                    });
                    return;
                }

                // Execute the action
                await execFileAsync(server.scripts[action]);

                // Give the container a moment to change state
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Automatically fetch and display status after action
                const details = await getDetailedContainerStatus(server.container);

                // Determine emoji based on status
                let emoji = "❓";
                if (details.status === "running") emoji = "🟢";
                else if (details.status === "exited") emoji = "🔴";
                else if (details.status === "restarting") emoji = "🟡";
                else if (details.status === "paused") emoji = "🟠";

                // Create rich embed for status display
                const embed = new EmbedBuilder()
                    .setColor(details.isRunning ? 0x00FF00 : 0xFF0000)
                    .setTitle(`${emoji} ${server.name} - Status After ${action === "down" ? "Stop" : "Restart"}`)
                    .addFields(
                        { name: "State", value: `\`\`\`${details.status}\`\`\``, inline: true },
                        { name: "Uptime", value: `\`\`\`${details.uptime}\`\`\``, inline: true },
                        { name: "CPU Usage", value: `\`\`\`${details.cpu}\`\`\``, inline: true },
                        { name: "Memory Usage", value: `\`\`\`${details.memory}\`\`\``, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `${action === "down" ? "Stopped" : "Restarted"} by ${interaction.user.tag}` });

                await confirmation.update({
                    content: null, // Clear the original message
                    embeds: [embed],
                    components: []
                });

            } catch (error) {
                // Timeout or other error
                await interaction.editReply({
                    content: "⏰ Confirmation timed out. Action cancelled.",
                    components: []
                });
            }
        }
    } catch (error) {
        console.error(`Error executing ${action} on ${server.name}:`, error);

        // Handle case where we already deferred a reply
        if (interaction.deferred) {
            await interaction.editReply({
                content: `❌ Error: ${error.message}`
            });
        } else {
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                ephemeral: true
            });
        }
    }
});

client.login(DISCORD_TOKEN).catch(console.error);
