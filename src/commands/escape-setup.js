/**
 * /escape-setup — run an Escape Velocity event (admins and moderators).
 *
 * `create` writes a draft and shows a private screen to pick media and
 * genres; its "Build questions" button generates the question bank from TMDB
 * and schedules the launch. The scheduler (escapeScheduler.js) posts the
 * mission card when the start time comes.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { isAdmin } from '../utils/guildConfig.js';
import { loadEvent, createDraft, cancelEvent, extendEvent } from '../utils/escapeStore.js';
import { setupView, poolLine } from '../utils/escapeUI.js';
import { buildPool, finishNow } from '../utils/escapeScheduler.js';

const DAY = 86400000;

export const data = new SlashCommandBuilder()
  .setName('escape-setup')
  .setDescription('🛠️ Set up and run an Escape Velocity trivia event (Admin/Mod only)')
  // Hidden from members who can't use it; execute() checks either way
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand(sub => sub
    .setName('create')
    .setDescription('Create an event, then pick its media and genres')
    .addStringOption(o => o.setName('name').setDescription('Event name (e.g., "Halloween Launch")').setRequired(true).setMaxLength(80))
    .addIntegerOption(o => o.setName('days').setDescription('How many days it runs').setRequired(true).setMinValue(1).setMaxValue(30))
    .addIntegerOption(o => o.setName('starts_in_hours').setDescription('Hours until launch (default: as soon as the questions are ready)').setMinValue(0).setMaxValue(720))
    .addChannelOption(o => o.setName('channel').setDescription('Where the mission card goes (default: here)').addChannelTypes(ChannelType.GuildText)))
  .addSubcommand(sub => sub
    .setName('cancel')
    .setDescription('Cancel the event without results')
    .addBooleanOption(o => o.setName('confirm').setDescription('Yes, cancel it').setRequired(true)))
  .addSubcommand(sub => sub
    .setName('end-now')
    .setDescription('Finish the event now and post the final results'))
  .addSubcommand(sub => sub
    .setName('extend')
    .setDescription('Add days to the event')
    .addIntegerOption(o => o.setName('days').setDescription('Days to add').setRequired(true).setMinValue(1).setMaxValue(30)))
  .addSubcommand(sub => sub
    .setName('pool')
    .setDescription('Show the question bank, or add more questions')
    .addBooleanOption(o => o.setName('add').setDescription('Top up every difficulty tier now')));

const STATUS = { draft: 'being set up', scheduled: 'scheduled', live: 'live', finished: 'finished', cancelled: 'cancelled' };

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ content: '❌ Only admins and moderators can run Escape Velocity events.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const now = Date.now();
    const startsAt = now + (interaction.options.getInteger('starts_in_hours') ?? 0) * 3600000;
    const days = interaction.options.getInteger('days');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const result = createDraft(guildId, {
      name: interaction.options.getString('name'),
      startsAt,
      endsAt: startsAt + days * DAY,
      channelId: channel.id,
      createdBy: interaction.user.id,
    }, now);
    if (result.error === 'event-exists') {
      await interaction.reply({
        content: `❌ **${result.event.name}** is already ${STATUS[result.event.status]}. Finish it with \`/escape-setup end-now\` or cancel it first.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({ ...setupView(loadEvent(guildId)), flags: MessageFlags.Ephemeral });
    return;
  }

  const data = loadEvent(guildId);
  if (!data || ['finished', 'cancelled'].includes(data.event.status)) {
    await interaction.reply({ content: '❌ There\'s no Escape Velocity event running. Start one with `/escape-setup create`.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'cancel') {
    if (!interaction.options.getBoolean('confirm')) {
      await interaction.reply({ content: 'Nothing changed — set `confirm` to True to cancel.', flags: MessageFlags.Ephemeral });
      return;
    }
    cancelEvent(guildId);
    await interaction.reply({ content: `🛑 **${data.event.name}** was cancelled.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'end-now') {
    if (data.event.status !== 'live') {
      await interaction.reply({ content: `❌ **${data.event.name}** isn't live (it's ${STATUS[data.event.status]}). Use \`cancel\` instead.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await finishNow(interaction.client, guildId);
    await interaction.editReply({ content: `🏁 **${data.event.name}** is over — the final results are posted in <#${data.event.channelId}>.` });
    return;
  }

  if (sub === 'extend') {
    const days = interaction.options.getInteger('days');
    const result = extendEvent(guildId, data.event.endsAt + days * DAY);
    if (result.error) {
      await interaction.reply({ content: `❌ Only a scheduled or live event can be extended (this one is ${STATUS[data.event.status]}).`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `📅 **${data.event.name}** now ends <t:${Math.floor(result.event.endsAt / 1000)}:f>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'pool') {
    if (!interaction.options.getBoolean('add')) {
      await interaction.reply({ content: `📚 **Question bank** — ${poolLine(data)}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (data.event.status === 'draft') {
      await interaction.reply({ content: '❌ Pick the media and genres first (the `/escape-setup create` screen).', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const added = await buildPool(guildId);
    await interaction.editReply({ content: `📚 Added ${added} questions. ${poolLine(loadEvent(guildId))}` });
  }
}
