const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
    { name: "Start Server", value: "up" },
    { name: "Stop Server", value: "down" },
    { name: "Restart Server", value: "restart" },
    { name: "Check Status", value: "status" }
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
    } catch (error) {
        console.error("❌ Failed to register commands:", error);
    }
})();

/* ───────── Discord Client ───────── */
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once("ready", () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log(`📝 Monitoring channel: #${CONTROL_CHANNEL}`);
});

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
        // Handle status check
        if (action === "status") {
            const { stdout } = await execFileAsync("docker", [
                "inspect",
                "--format={{.State.Status}}",
                server.container
            ]);

            const status = stdout.trim();
            let emoji = "❓";
            if (status === "running") emoji = "🟢";
            if (status === "exited") emoji = "🔴";
            if (status === "restarting") emoji = "🟡";

            return interaction.reply(`📊 **${server.name}**: ${emoji} ${status}`);
        }

        // Handle start command (no confirmation needed)
        if (action === "up") {
            await execFileAsync(server.scripts.up);
            return interaction.reply(`🟢 **${server.name}** is starting...`);
        }

        // Handle destructive actions (require confirmation)
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
                await confirmation.update({
                    content: `✅ **${server.name}** ${action === "down" ? "stopped" : "restarting"}...`,
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
        await interaction.reply({
            content: `❌ Error: ${error.message}`,
            ephemeral: true
        });
    }
});

client.login(DISCORD_TOKEN).catch(console.error);
