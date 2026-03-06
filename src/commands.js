import "dotenv/config";
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the music control panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!clientId || !process.env.DISCORD_TOKEN) {
  console.error("Missing CLIENT_ID or DISCORD_TOKEN in .env");
  process.exit(1);
}

(async () => {
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log("✅ Registered guild commands.");
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      console.log("✅ Registered global commands.");
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();