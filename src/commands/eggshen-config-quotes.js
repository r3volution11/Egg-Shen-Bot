import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';
import { loadQuotes, addQuote, updateQuote, deleteQuote } from '../utils/movieQuotesStore.js';
import { signQuotesAdminLinkToken } from '../utils/quotesAdminLinkToken.js';

const QUOTES_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-quotes')
  .setDescription('Manage the bot\'s status quotes and quote-suggestion settings (Admin/Moderator only)')
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
      .setDescription('Edit a quote by its index (see /eggshen-config-quotes list)')
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
      .setDescription('Delete a quote by its index (see /eggshen-config-quotes list)')
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
  .addSubcommand(subcommand =>
    subcommand
      .setName('max-pending-per-user')
      .setDescription('Set how many suggestions a user can have awaiting review at once (default: 3)')
      .addIntegerOption(option =>
        option
          .setName('max')
          .setDescription('Maximum pending suggestions per user')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('admin-link')
      .setDescription('Get a one-click link that opens /quotes-admin already unlocked')
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

  } else if (subcommand === 'max-pending-per-user') {
    const max = interaction.options.getInteger('max');

    const config = await loadGuildConfig(guildId);
    if (!config.quoteSuggestions) {
      config.quoteSuggestions = {};
    }

    config.quoteSuggestions.maxPendingPerUser = max;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Users can now have at most ${max} quote suggestion(s) awaiting review at once.`,
      ephemeral: true,
    });

  } else if (subcommand === 'admin-link') {
    if (!process.env.QUOTES_ADMIN_SECRET) {
      await interaction.reply({
        content: '❌ Quote editing is not configured on this server (`QUOTES_ADMIN_SECRET` is not set).',
        ephemeral: true,
      });
      return;
    }
    if (!process.env.PUBLIC_BOT_URL) {
      await interaction.reply({
        content: '❌ `PUBLIC_BOT_URL` is not set on this server, so a working link can\'t be built. Set it in `.env` to your bot\'s public URL (e.g. `https://yourdomain.com`).',
        ephemeral: true,
      });
      return;
    }

    const config = await loadGuildConfig(guildId);
    const theme = config.website?.theme || 'default';

    let token;
    try {
      token = signQuotesAdminLinkToken({ theme });
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
      return;
    }

    const url = `${process.env.PUBLIC_BOT_URL}/quotes-admin?token=${token}`;
    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open Quotes Admin').setStyle(ButtonStyle.Link).setURL(url).setEmoji('🎬')
    );

    await interaction.reply({
      content: '🔒 This link opens `/quotes-admin` already unlocked. It works once and expires in 10 minutes — request a new one with `/eggshen-config-quotes admin-link` if it expires.',
      components: [button],
      ephemeral: true,
    });
  }
}
