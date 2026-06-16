/**
 * Handle button interactions
 */
export async function handleButtonInteraction(interaction) {
  // Handle "Log to Watch History" button from timer stop
  if (interaction.customId.startsWith('log_watched_')) {
    const [, , channelId, userId] = interaction.customId.split('_');
    
    // Only allow the person who stopped the timer to log it
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: '❌ Only the person who stopped the timer can log it to watch history.',
        ephemeral: true,
      });
      return;
    }
    
    // Get the timer label from the message
    const embed = interaction.message.embeds[0];
    const title = embed.description?.replace(/\*\*/g, '') || null;
    
    if (!title) {
      await interaction.reply({
        content: '❌ No title found. The timer needs a label to be logged to watch history.',
        ephemeral: true,
      });
      return;
    }
    
    // Prompt for rating and notes
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const modal = new ModalBuilder()
      .setCustomId(`watched_modal_${channelId}_${userId}_${Buffer.from(title).toString('base64')}`)
      .setTitle('Log to Watch History');
    
    const ratingInput = new TextInputBuilder()
      .setCustomId('rating')
      .setLabel('Your rating (1-10)')
      .setPlaceholder('Optional - leave blank to skip')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
    
    const notesInput = new TextInputBuilder()
      .setCustomId('notes')
      .setLabel('Notes or review')
      .setPlaceholder('Optional - your thoughts on what you watched')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    
    const ratingRow = new ActionRowBuilder().addComponents(ratingInput);
    const notesRow = new ActionRowBuilder().addComponents(notesInput);
    
    modal.addComponents(ratingRow, notesRow);
    
    await interaction.showModal(modal);
  }
}
