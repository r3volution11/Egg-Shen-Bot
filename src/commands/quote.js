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
    .map(title => ({ name: title, value: title }));

  await interaction.respond(matches);
}
