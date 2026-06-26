/**
 * Handle button interactions
 */
export async function handleButtonInteraction(interaction) {
  // Handle knockout voting buttons
  if (interaction.customId.startsWith('knockout_vote_')) {
    const [, , matchupId, choice] = interaction.customId.split('_');
    
    // Dynamically import bracketManager
    const { default: bracketManager } = await import('../utils/bracketManager.js');
    const { EmbedBuilder } = await import('discord.js');
    
    const result = bracketManager.voteKnockout(
      interaction.guild.id,
      interaction.user.id,
      matchupId,
      parseInt(choice)
    );
    
    if (!result.success) {
      await interaction.reply({
        content: `❌ ${result.error}`,
        ephemeral: true
      });
      return;
    }
    
    // Find the matchup to get movie titles
    const matchup = result.tournament.knockoutBracket.find(m => m.id === matchupId);
    const votedMovie = choice === '1' ? matchup.movie1 : matchup.movie2;
    
    await interaction.reply({
      content: `✅ Vote recorded for **${votedMovie.title}**!\n\nYou can change your vote anytime before voting closes.`,
      ephemeral: true
    });
    
    // Update the embed to show new vote counts
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    
    // Find the embed for this matchup in the original message
    const messageEmbeds = interaction.message.embeds;
    const matchupEmbedIndex = messageEmbeds.findIndex(e => 
      e.title && e.title.includes(`Matchup ${matchup.position + 1}`)
    );
    
    if (matchupEmbedIndex !== -1) {
      const updatedEmbed = EmbedBuilder.from(messageEmbeds[matchupEmbedIndex])
        .setFields(
          { 
            name: `${matchup.movie1.title}`, 
            value: `${votes1} vote${votes1 !== 1 ? 's' : ''}`, 
            inline: true 
          },
          { name: '\u200B', value: 'vs', inline: true },
          { 
            name: `${matchup.movie2.title}`, 
            value: `${votes2} vote${votes2 !== 1 ? 's' : ''}`, 
            inline: true 
          }
        );
      
      const newEmbeds = [...messageEmbeds];
      newEmbeds[matchupEmbedIndex] = updatedEmbed;
      
      await interaction.message.edit({ embeds: newEmbeds });
    }
    
    return;
  }
  
  // Handle "Log to Watch History" button from timer stop
  if (interaction.customId.startsWith('log_watched_')) {
    const [, , channelId, starterUserId] = interaction.customId.split('_');
    
    // Check if user is the timer starter OR has admin/mod permissions
    const isModerator = interaction.member.permissions.has('Administrator') || 
                       interaction.member.permissions.has('ManageGuild') ||
                       interaction.member.permissions.has('ModerateMembers');
    
    if (interaction.user.id !== starterUserId && !isModerator) {
      await interaction.reply({
        content: '❌ Only the person who started the timer or server administrators/moderators can log it to watch history.',
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
      .setCustomId(`watched_modal_${channelId}_${starterUserId}_${Buffer.from(title).toString('base64')}`)
      .setTitle('Log to Watch History');
    
    const notesInput = new TextInputBuilder()
      .setCustomId('notes')
      .setLabel('Notes (optional)')
      .setPlaceholder('Optional - notes about this watch party')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    
    const notesRow = new ActionRowBuilder().addComponents(notesInput);
    
    modal.addComponents(notesRow);
    
    await interaction.showModal(modal);
  }
}
