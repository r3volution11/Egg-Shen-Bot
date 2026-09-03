import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { addPending } from '../utils/pendingQuotesStore.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('suggest-quote')
  .setDescription('Suggest a quote for the bot\'s status rotation (reviewed by a moderator)')
  .addStringOption(option =>
    option
      .setName('quote')
      .setDescription('The quote text')
      .setRequired(true)
      .setMaxLength(400)
  )
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('The movie/show/game/etc. it\'s from')
      .setRequired(false)
      .setMaxLength(100)
  )
  .addStringOption(option =>
    option
      .setName('author')
      .setDescription('The character or real person who said it')
      .setRequired(false)
      .setMaxLength(100)
  );

export async function execute(interaction) {
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'suggestQuote');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/suggest-quote` command is currently disabled for regular users on this server. Contact an administrator if you believe this is an error.',
      ephemeral: true,
    });
    return;
  }

  const text = interaction.options.getString('quote');
  const title = interaction.options.getString('title');
  const author = interaction.options.getString('author');

  await interaction.deferReply({ ephemeral: true });

  const id = await addPending({
    text,
    title,
    author,
    suggestedBy: interaction.user.tag,
    guildId: interaction.guildId,
  });

  const config = await loadGuildConfig(interaction.guildId);
  const moderationChannelId = config.quoteSuggestions?.moderationChannel;

  let posted = false;
  if (moderationChannelId) {
    const modChannel = interaction.guild?.channels.cache.get(moderationChannelId);
    if (modChannel && modChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('💬 New Quote Suggestion')
        .setDescription(`*"${text}"*`)
        .addFields(
          { name: 'Title', value: title || 'Not given', inline: true },
          { name: 'Author', value: author || 'Not given', inline: true },
          { name: 'Suggested By', value: interaction.user.tag, inline: false }
        )
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_quote_${id}`).setLabel('Approve').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`edit_quote_${id}`).setLabel('Edit').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
        new ButtonBuilder().setCustomId(`reject_quote_${id}`).setLabel('Reject').setStyle(ButtonStyle.Danger).setEmoji('❌')
      );

      try {
        await modChannel.send({ embeds: [embed], components: [buttons] });
        posted = true;
      } catch (error) {
        console.error('[SuggestQuote] Failed to post to moderation channel:', error);
      }
    }
  }

  await interaction.editReply({
    content: posted
      ? '✅ Thanks! Your quote suggestion has been sent to the moderators for review.'
      : '✅ Thanks! Your quote suggestion has been submitted for review.',
  });
}
