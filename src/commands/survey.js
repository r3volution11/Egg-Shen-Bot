import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import {
  createPoll,
  getPoll,
  getActivePolls,
  getClosedPolls,
  deletePoll,
  canManagePoll,
  getPollResults,
  getUserVote,
  createPollEmbed,
  closePollAndAnnounce,
  VOTE_EMOJIS,
} from '../utils/pollManager.js';
import { canUseCommand } from '../utils/guildConfig.js';

// Re-exported for backward compatibility — tests and any other callers
// import createPollEmbed from here; the implementation now lives in
// pollManager.js so both the command and the reaction handlers/scheduler
// in src/index.js and pollScheduler.js can share it.
export { createPollEmbed };

export const data = new SlashCommandBuilder()
  .setName('survey')
  .setDescription('Create and manage surveys/polls')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new survey')
      .addStringOption(option =>
        option
          .setName('question')
          .setDescription('The survey question')
          .setRequired(true)
          .setMaxLength(256)
      )
      .addStringOption(option =>
        option
          .setName('option1')
          .setDescription('First option')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option2')
          .setDescription('Second option')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option3')
          .setDescription('Third option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option4')
          .setDescription('Fourth option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option5')
          .setDescription('Fifth option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option6')
          .setDescription('Sixth option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option7')
          .setDescription('Seventh option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option8')
          .setDescription('Eighth option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option9')
          .setDescription('Ninth option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('option10')
          .setDescription('Tenth option (optional)')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addBooleanOption(option =>
        option
          .setName('multiple')
          .setDescription('Allow users to vote for multiple options')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Auto-close voting after this many minutes (omit for no auto-close)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20160) // 14 days
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all surveys')
      .addStringOption(option =>
        option
          .setName('filter')
          .setDescription('Filter surveys by status')
          .setRequired(false)
          .addChoices(
            { name: 'Active Only', value: 'active' },
            { name: 'Closed Only', value: 'closed' },
            { name: 'All', value: 'all' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('results')
      .setDescription('View results of a specific survey')
      .addStringOption(option =>
        option
          .setName('poll_id')
          .setDescription('The survey to view')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close')
      .setDescription('Close an active survey (admin/mod/creator only)')
      .addStringOption(option =>
        option
          .setName('poll_id')
          .setDescription('The survey to close')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Permanently delete a survey (admin/mod/creator only)')
      .addStringOption(option =>
        option
          .setName('poll_id')
          .setDescription('The survey to delete')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

/**
 * Execute the survey command
 */
export async function execute(interaction) {
  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'survey');
  
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/survey` command is currently disabled for regular users on this server. Contact an administrator if you believe this is an error.',
      ephemeral: true,
    });
    return;
  }
  
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'create':
      await handleCreate(interaction);
      break;
    case 'list':
      await handleList(interaction);
      break;
    case 'results':
      await handleResults(interaction);
      break;
    case 'close':
      await handleClose(interaction);
      break;
    case 'delete':
      await handleDelete(interaction);
      break;
  }
}

/**
 * Autocomplete for the poll_id option on /survey results, close, and delete.
 * - results: any survey, active or closed (read-only, no permission needed)
 * - close/delete: only surveys the invoking user can actually manage
 *   (creator, admin, or mod), so a suggestion never leads to a permission
 *   error after picking it
 */
export async function autocomplete(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const focusedValue = interaction.options.getFocused().toLowerCase();

  let polls = subcommand === 'results'
    ? [...getActivePolls(interaction.guildId), ...getClosedPolls(interaction.guildId)]
    : getActivePolls(interaction.guildId);

  if (subcommand === 'close' || subcommand === 'delete') {
    polls = polls.filter(poll => canManagePoll(poll, interaction.member));
  }

  polls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const matches = polls
    .filter(poll => poll.question.toLowerCase().includes(focusedValue))
    .slice(0, 25)
    .map(poll => {
      const { totalVotes } = getPollResults(poll);
      const statusEmoji = poll.status === 'active' ? '🟢' : '🔴';
      const label = `${statusEmoji} ${poll.question} (${totalVotes} vote${totalVotes !== 1 ? 's' : ''})`;
      return {
        name: label.length > 100 ? `${label.slice(0, 97)}...` : label,
        value: poll.pollId,
      };
    });

  await interaction.respond(matches);
}

/**
 * Handle /survey create
 */
async function handleCreate(interaction) {
  await interaction.deferReply();
  
  const question = interaction.options.getString('question');
  const allowMultiple = interaction.options.getBoolean('multiple') || false;
  const duration = interaction.options.getInteger('duration') || null;

  // Collect all provided options
  const options = [];
  for (let i = 1; i <= 10; i++) {
    const option = interaction.options.getString(`option${i}`);
    if (option) {
      options.push(option);
    }
  }
  
  // Validate options count
  if (options.length < 2) {
    await interaction.editReply({
      content: '❌ You must provide at least 2 options.',
      ephemeral: true,
    });
    return;
  }
  
  if (options.length > VOTE_EMOJIS.length) {
    await interaction.editReply({
      content: `❌ Maximum ${VOTE_EMOJIS.length} options allowed.`,
      ephemeral: true,
    });
    return;
  }
  
  try {
    // Create initial message
    const tempEmbed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setDescription('Creating survey...')
      .setColor(0x5865F2);
    
    const message = await interaction.editReply({ embeds: [tempEmbed] });
    
    // Create poll in storage
    const poll = createPoll(
      interaction.guildId,
      interaction.channelId,
      message.id,
      interaction.user.id,
      question,
      options,
      allowMultiple,
      duration
    );

    // Update message with full poll
    const pollEmbed = createPollEmbed(poll, false);
    await interaction.editReply({ embeds: [pollEmbed] });

    // Add reaction emojis
    for (let i = 0; i < options.length; i++) {
      await message.react(VOTE_EMOJIS[i]);
    }

    // Send confirmation to creator
    const autoCloseNote = duration
      ? `\n**Auto-closes:** <t:${Math.floor(new Date(poll.expiresAt).getTime() / 1000)}:R>`
      : '';
    await interaction.followUp({
      content: `✅ Survey created! Users can vote by reacting to the message.\n\n**Survey ID:** \`${poll.pollId}\`${autoCloseNote}\n**Manage:** Use \`/survey close ${poll.pollId}\` to close or \`/survey delete ${poll.pollId}\` to delete.`,
      ephemeral: true,
    });
    
  } catch (error) {
    console.error('Error creating survey:', error);
    await interaction.editReply({
      content: '❌ Failed to create survey. Please try again.',
    });
  }
}

/**
 * Handle /survey list
 */
async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const filter = interaction.options.getString('filter') || 'active';
  
  let polls;
  if (filter === 'active') {
    polls = getActivePolls(interaction.guildId);
  } else if (filter === 'closed') {
    polls = getClosedPolls(interaction.guildId);
  } else {
    polls = [...getActivePolls(interaction.guildId), ...getClosedPolls(interaction.guildId)];
  }
  
  if (polls.length === 0) {
    await interaction.editReply({
      content: `📊 No ${filter !== 'all' ? filter : ''} surveys found.`,
    });
    return;
  }
  
  // Sort by creation date (newest first)
  polls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)} Surveys`)
    .setColor(0x5865F2)
    .setFooter({ text: `Total: ${polls.length} survey${polls.length !== 1 ? 's' : ''}` });
  
  // Group polls in chunks of 10
  const pollsToShow = polls.slice(0, 25); // Discord embed field limit
  
  for (const poll of pollsToShow) {
    const { totalVotes } = getPollResults(poll);
    const createdDate = new Date(poll.createdAt);
    const statusEmoji = poll.status === 'active' ? '🟢' : '🔴';
    const expiryLine = poll.status === 'active' && poll.expiresAt
      ? `\n**Auto-closes:** <t:${Math.floor(new Date(poll.expiresAt).getTime() / 1000)}:R>`
      : '';

    embed.addFields({
      name: `${statusEmoji} ${poll.question}`,
      value: `**ID:** \`${poll.pollId}\`\n**Votes:** ${totalVotes}\n**Created:** <t:${Math.floor(createdDate.getTime() / 1000)}:R>\n**Channel:** <#${poll.channelId}>${expiryLine}`,
      inline: false,
    });
  }
  
  if (polls.length > 25) {
    embed.setDescription(`Showing first 25 of ${polls.length} surveys.`);
  }
  
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle /survey results
 */
async function handleResults(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const pollId = interaction.options.getString('poll_id');
  const poll = getPoll(interaction.guildId, pollId);
  
  if (!poll) {
    await interaction.editReply({
      content: '❌ Survey not found. Use `/survey list` to see all surveys.',
    });
    return;
  }
  
  const embed = createPollEmbed(poll, true);
  
  // Add link to original message
  const messageLink = `https://discord.com/channels/${poll.guildId}/${poll.channelId}/${poll.messageId}`;
  embed.addFields({
    name: 'Original Survey',
    value: `[Jump to message](${messageLink})`,
    inline: true,
  });
  
  // Show user's votes if any
  const userVotes = getUserVote(poll, interaction.user.id);
  if (userVotes.length > 0) {
    const votedOptions = poll.options
      .filter(opt => userVotes.includes(opt.id))
      .map(opt => `${opt.emoji} ${opt.text}`)
      .join(', ');
    
    embed.addFields({
      name: 'Your Vote(s)',
      value: votedOptions,
      inline: true,
    });
  }
  
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle /survey close
 */
async function handleClose(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const pollId = interaction.options.getString('poll_id');
  const poll = getPoll(interaction.guildId, pollId);
  
  if (!poll) {
    await interaction.editReply({
      content: '❌ Survey not found. Use `/survey list` to see all surveys.',
    });
    return;
  }
  
  if (poll.status === 'closed') {
    await interaction.editReply({
      content: '❌ This survey is already closed.',
    });
    return;
  }
  
  // Check permissions
  if (!canManagePoll(poll, interaction.member)) {
    await interaction.editReply({
      content: '❌ You do not have permission to close this survey. Only the survey creator, administrators, or moderators can close surveys.',
    });
    return;
  }
  
  const result = await closePollAndAnnounce(interaction.client, interaction.guildId, pollId, interaction.user.id);

  if (!result.success) {
    console.error('Error closing survey:', result.error);
    await interaction.editReply({
      content: '❌ Failed to close survey. Please try again.',
    });
    return;
  }

  await interaction.editReply({
    content: `✅ Survey "${poll.question}" has been closed.`,
  });
}

/**
 * Handle /survey delete
 */
async function handleDelete(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const pollId = interaction.options.getString('poll_id');
  const poll = getPoll(interaction.guildId, pollId);
  
  if (!poll) {
    await interaction.editReply({
      content: '❌ Survey not found. Use `/survey list` to see all surveys.',
    });
    return;
  }
  
  // Check permissions
  if (!canManagePoll(poll, interaction.member)) {
    await interaction.editReply({
      content: '❌ You do not have permission to delete this survey. Only the survey creator, administrators, or moderators can delete surveys.',
    });
    return;
  }
  
  try {
    // Delete the poll
    deletePoll(interaction.guildId, pollId);
    
    // Try to delete the original message
    try {
      const channel = await interaction.client.channels.fetch(poll.channelId);
      const message = await channel.messages.fetch(poll.messageId);
      await message.delete();
    } catch (error) {
      console.error('Could not delete survey message:', error);
    }
    
    await interaction.editReply({
      content: `✅ Survey "${poll.question}" has been permanently deleted.`,
    });
    
  } catch (error) {
    console.error('Error deleting survey:', error);
    await interaction.editReply({
      content: '❌ Failed to delete survey. Please try again.',
    });
  }
}
