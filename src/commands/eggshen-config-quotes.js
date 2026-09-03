import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';
import { loadQuotes, addQuote, updateQuote, deleteQuote } from '../utils/movieQuotesStore.js';

const QUOTES_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-quotes')
  .setDescription('Manage the bot\'s status quotes and quote-suggestion settings (Admin/Moderator only)')
  .addSubcommandGroup(group =>
    group
      .setName('quotes')
      .setDescription('Manage status quotes')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a quote directly to the live rotation (no review needed)')
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
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('edit')
          .setDescription('Edit a quote by its index (see /eggshen-config-quotes quotes list)')
          .addIntegerOption(option =>
            option
              .setName('index')
              .setDescription('The quote\'s index')
              .setRequired(true)
              .setMinValue(0)
          )
          .addStringOption(option =>
            option
              .setName('quote')
              .setDescription('New quote text')
              .setRequired(true)
              .setMaxLength(400)
          )
          .addStringOption(option =>
            option
              .setName('title')
              .setDescription('New title (leave blank to clear)')
              .setRequired(false)
              .setMaxLength(100)
          )
          .addStringOption(option =>
            option
              .setName('author')
              .setDescription('New author (leave blank to clear)')
              .setRequired(false)
              .setMaxLength(100)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('delete')
          .setDescription('Delete a quote by its index (see /eggshen-config-quotes quotes list)')
          .addIntegerOption(option =>
            option
              .setName('index')
              .setDescription('The quote\'s index')
              .setRequired(true)
              .setMinValue(0)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List the current status quotes')
          .addIntegerOption(option =>
            option
              .setName('page')
              .setDescription('Page number (10 quotes per page)')
              .setRequired(false)
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('moderation-channel')
          .setDescription('Set the channel where /suggest-quote submissions are sent for approval')
          .addChannelOption(option =>
            option
              .setName('channel')
              .setDescription('Text channel for moderation of quote suggestions')
              .setRequired(true)
          )
      )
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need Administrator, Manage Server, or Moderator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (subcommand === 'add') {
    const text = interaction.options.getString('quote');
    const title = interaction.options.getString('title');
    const author = interaction.options.getString('author');

    try {
      const quotes = await addQuote({ text, title, author });
      await interaction.reply({
        content: `✅ Quote added at index ${quotes.length - 1}. It's live in the rotation immediately.`,
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }

  } else if (subcommand === 'edit') {
    const index = interaction.options.getInteger('index');
    const text = interaction.options.getString('quote');
    const title = interaction.options.getString('title');
    const author = interaction.options.getString('author');

    try {
      await updateQuote(index, { text, title, author });
      await interaction.reply({ content: `✅ Quote at index ${index} updated.`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }

  } else if (subcommand === 'delete') {
    const index = interaction.options.getInteger('index');

    try {
      await deleteQuote(index);
      await interaction.reply({ content: `✅ Quote at index ${index} deleted.`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }

  } else if (subcommand === 'list') {
    const quotes = await loadQuotes();

    if (quotes.length === 0) {
      await interaction.reply({ content: 'No quotes yet.', ephemeral: true });
      return;
    }

    const totalPages = Math.ceil(quotes.length / QUOTES_PER_PAGE);
    const page = Math.min(interaction.options.getInteger('page') || 1, totalPages);
    const start = (page - 1) * QUOTES_PER_PAGE;
    const pageQuotes = quotes.slice(start, start + QUOTES_PER_PAGE);

    const lines = pageQuotes.map((q, i) => {
      const index = start + i;
      const meta = [q.title, q.author].filter(Boolean).join(' — ');
      return `**${index}.** ${q.text}${meta ? ` *(${meta})*` : ''}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle('🎬 Status Quotes')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Page ${page} of ${totalPages} • ${quotes.length} quote(s) total` });

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (subcommand === 'moderation-channel') {
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
      await interaction.reply({ content: '❌ Please select a text channel.', ephemeral: true });
      return;
    }

    const config = await loadGuildConfig(guildId);
    if (!config.quoteSuggestions) {
      config.quoteSuggestions = {};
    }

    config.quoteSuggestions.moderationChannel = channel.id;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Quote suggestion moderation channel set to ${channel}.`,
      ephemeral: true,
    });
  }
}
