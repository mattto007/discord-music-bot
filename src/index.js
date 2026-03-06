import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { handlePanelCommand, handleInteractions } from "./panel.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "panel") {
        return handlePanelCommand(interaction);
      }
      return;
    }

    return handleInteractions(interaction);
  } catch (e) {
    console.error(e);

    if (interaction.isRepliable()) {
      const msg = `Error: ${e?.message ?? e}`;
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      }
      return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);