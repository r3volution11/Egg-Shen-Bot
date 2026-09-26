import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadQuotes } from '../utils/movieQuotesStore.js';
import { canUseCommand } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('quote')
  .setDescription('Post a random status quote into the channel')
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Only pull quotes from this movie/show/game/etc.')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('author')
      .setDescription('Only pull quotes by/from this character or person')
      .setRequired(false)
  );

export async function execute(interaction) {
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'quote');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/quote` command is currently disabled for regular users on this server. Contact an administrator if you believe this is an error.',
      ephemeral: true,
    });
    return;
  }

  const titleFilter = interaction.options.getString('title')?.trim().toLowerCase();
  const authorFilter = interaction.options.getString('author')?.trim().toLowerCase();

  const quotes = await loadQuotes();

  let candidates = quotes;
  if (titleFilter || authorFilter) {
    candidates = quotes.filter(q => {
      const titleMatches = titleFilter && q.title?.toLowerCase().includes(titleFilter);
      const authorMatches = authorFilter && q.author?.toLowerCase().includes(authorFilter);
      return titleMatches || authorMatches;
    });
  }

  if (candidates.length === 0) {
    await interaction.reply({
      content: '❌ No quotes found matching that.',
      ephemeral: true,
    });
    return;
  }

  const quote = candidates[Math.floor(Math.random() * candidates.length)];

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`*"${quote.text}"*`);

  let footer = null;
  if (quote.author && quote.title) {
    footer = `— ${quote.author}, "${quote.title}"`;
  } else if (quote.author) {
    footer = `— ${quote.author}`;
  } else if (quote.title) {
    footer = `"${quote.title}"`;
  }
  if (footer) {
    embed.setFooter({ text: footer });
  }

  await interaction.reply({ embeds: [embed] });
}

export async function autocomplete(interaction) {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const quotes = await loadQuotes();

  const titles = [...new Set(quotes.map(q => q.title).filter(Boolean))];
  const matches = titles
    .filter(title => title.toLowerCase().includes(focusedValue))
    .slice(0, 25)
    // Discord caps both fields at 100 and rejects the WHOLE response if any
    // one exceeds it, leaving the user with no suggestions at all. The Discord
    // input path is capped, but the web path is not: POST /api/quotes and
    // PUT /api/quotes/bulk reach normalizeQuote, which only trims.
    //
    // Truncating the value is safe because execute() uses it as a substring
    // filter (`q.title.includes(titleFilter)`), so a clipped title still
    // matches the full stored one.
    .map(title => ({ name: title.slice(0, 100), value: title.slice(0, 100) }));

  await interaction.respond(matches);
}
