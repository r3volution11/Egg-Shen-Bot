import { SlashCommandBuilder } from 'discord.js';
import { isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-restart')
  .setDescription('Restart the bot (Admin/Moderator only)');

export async function execute(interaction) {
  // Check if user has admin/moderator permissions
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need Administrator, Manage Server, or Moderator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  // Send confirmation message
  await interaction.reply({
    content: '🔄 Restarting Egg Shen... The bot will be back online in a few seconds.',
    ephemeral: false,
  });

  // Log the restart
  console.log(`Bot restart initiated by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guild.name} (${interaction.guildId})`);

  // Wait a moment for the message to send, then exit
  setTimeout(() => {
    console.log('Exiting process for restart...');
    process.exit(0); // Exit cleanly - PM2 or systemd will restart the bot
  }, 1000);
}
