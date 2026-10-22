/**
 * Escape Velocity's buttons and selects (every customId starting `ev_`).
 *
 * The mission card is public, so anyone can click its buttons — each handler
 * checks for itself (CLAUDE.md: a command's gate doesn't protect the buttons
 * it posts). Launch and My mission check the server's switch for the game;
 * answer and Abort check the run belongs to the clicker; setup checks for an
 * admin.
 */

import { MessageFlags } from 'discord.js';
import { canUseCommand, isAdmin } from '../utils/guildConfig.js';
import {
  loadEvent, startRun, answer, abortRun, setDraftSelection, scheduleEvent, markLaunched, poolReady,
} from '../utils/escapeStore.js';
import { dashboard, runOver, myMission, setupView, poolLine, pts } from '../utils/escapeUI.js';

const STATUS_WORD = { draft: 'still being set up', scheduled: 'scheduled' };

/** Why a player can't play right now. */
export function notLiveText(data) {
  if (!data || ['finished', 'cancelled'].includes(data?.event.status)) {
    return '🛰️ There\'s no Escape Velocity mission running right now.';
  }
  if (data.event.status === 'scheduled') {
    return `🛰️ **${data.event.name}** launches <t:${Math.floor(data.event.startsAt / 1000)}:R>.`;
  }
  return `🛰️ **${data.event.name}** is ${STATUS_WORD[data.event.status] || data.event.status}.`;
}

/**
 * Start or resume the clicker's run, and render what they should see: the
 * dashboard, today's result if they've flown, or why they can't.
 */
export function launchFor(interaction, now = Date.now()) {
  const result = startRun(interaction.guildId, interaction.user.id, now);
  if (result.error === 'no-event' || result.error === 'not-live') {
    return { content: notLiveText(loadEvent(interaction.guildId)), embeds: [], components: [] };
  }
  if (result.error === 'done-today') return runOver(result.run);
  if (result.error) {
    return { content: '⚠️ The question bank is empty — an admin can add more with `/escape-setup pool add:True`.', embeds: [], components: [] };
  }
  const flash = result.resumed
    ? '↩️ Picking up where you left off.'
    : result.joined ? '🚀 Welcome aboard! Liftoff…' : '🚀 Liftoff!';
  return dashboard(result.run, result.question, { flash });
}

/**
 * Worth telling the channel about: a NEW message, since edits never notify.
 * Mentions display the name without pinging (it's their news, not a summons).
 */
async function announceMilestone(interaction, data, run, outcome) {
  let text = null;
  if (outcome === 'orbit') text = `🌍 <@${run.userId}> reached **ORBIT** — all 15 stages, **${pts(run.final)}**!`;
  else if (outcome === 'correct' && run.stage === 11) text = `🛰 <@${run.userId}> cleared stage separation 10 — **${pts(run.banked)}** locked in.`;
  if (!text) return;
  const channel = await interaction.client.channels.fetch(data.event.channelId).catch(() => null);
  await channel?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
}

async function handleAnswer(interaction) {
  const [, , runId, stageStr, choiceStr] = interaction.customId.split('_');
  const stage = Number(stageStr);
  const choice = Number(choiceStr);
  const result = answer(interaction.guildId, { runId, userId: interaction.user.id, stage, choice });

  if (result.error === 'not-yours') {
    await interaction.reply({ content: '❌ That\'s someone else\'s launch.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (result.error) {
    // A stale button (already answered, run over): show where things stand
    const data = loadEvent(interaction.guildId);
    const run = data?.runs[runId];
    const view = run?.status === 'active' ? dashboard(run, data.questions[run.questionId]) : run ? runOver(run) : { content: notLiveText(data), embeds: [], components: [] };
    await interaction.update(view);
    return;
  }

  const { outcome, run, question, correctIndex, next } = result;
  if (outcome === 'correct') {
    await interaction.update(dashboard(run, next, { flash: `✅ **Correct!** ${question.options[correctIndex]} — ${pts(run.banked)} banked.` }));
  } else {
    await interaction.update(runOver(run, { question, correctIndex, choice }));
  }
  await announceMilestone(interaction, loadEvent(interaction.guildId), run, outcome);
}

async function handleAbort(interaction) {
  const [, , runId, stageStr] = interaction.customId.split('_');
  const result = abortRun(interaction.guildId, { runId, userId: interaction.user.id, stage: Number(stageStr) });
  if (result.error === 'not-yours') {
    await interaction.reply({ content: '❌ That\'s someone else\'s launch.', flags: MessageFlags.Ephemeral });
    return;
  }
  const run = result.run || loadEvent(interaction.guildId)?.runs[runId];
  await interaction.update(run ? runOver(run) : { content: notLiveText(loadEvent(interaction.guildId)), embeds: [], components: [] });
}

/** "Build questions & schedule": generate the pool, then launch if it's time. */
async function handleSetupGo(interaction) {
  const guildId = interaction.guildId;
  const scheduled = scheduleEvent(guildId);
  if (scheduled.error) {
    await interaction.update(setupView(loadEvent(guildId), { note: '⚠️ Pick at least one medium and one genre first.' }));
    return;
  }

  await interaction.update({ content: '🛠️ Building the question bank from TMDB…', embeds: [], components: [] });

  // Imported here: the scheduler imports this file's helpers' modules too
  const { buildPool, postMissionCard } = await import('../utils/escapeScheduler.js');
  let lastShown = 0;
  const added = await buildPool(guildId, {
    onProgress: ({ made, wanted }) => {
      if (made - lastShown < 15) return;
      lastShown = made;
      interaction.editReply({ content: `🛠️ Building the question bank… ${made} of ${wanted}` }).catch(() => {});
    },
  });

  const data = loadEvent(guildId);
  if (!poolReady(data)) {
    await interaction.editReply({
      content: `⚠️ Only ${added} questions so far (${poolLine(data)}). The event stays scheduled and will keep building questions; it launches once every tier has enough.`,
    });
    return;
  }

  const now = Date.now();
  if (now >= data.event.startsAt && markLaunched(guildId, now).launched) {
    await postMissionCard(interaction.client, guildId, now);
    await interaction.editReply({ content: `🚀 **${data.event.name}** is live in <#${data.event.channelId}>! ${added} questions ready (${poolLine(data)}).` });
    return;
  }
  await interaction.editReply({
    content: `✅ **${data.event.name}** is scheduled to launch <t:${Math.floor(data.event.startsAt / 1000)}:R> in <#${data.event.channelId}>. ${added} questions ready (${poolLine(data)}).`,
  });
}

export async function handleEscapeButton(interaction) {
  const id = interaction.customId;

  if (id === 'ev_launch' || id === 'ev_mine') {
    if (!(await canUseCommand(interaction.guildId, interaction.member, 'escape'))) {
      await interaction.reply({ content: '❌ Escape Velocity is turned off on this server.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (id === 'ev_launch') {
      await interaction.reply({ ...launchFor(interaction), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      return;
    }
    const data = loadEvent(interaction.guildId);
    if (!data?.players[interaction.user.id]) {
      await interaction.reply({ content: '🛰️ You haven\'t launched yet — press **Launch** to join the mission.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ ...myMission(data, interaction.user.id), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }

  if (id.startsWith('ev_ans_')) return handleAnswer(interaction);
  if (id.startsWith('ev_abort_')) return handleAbort(interaction);

  if (id === 'ev_setup_go') {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: '❌ Only admins and moderators can set up Escape Velocity.', flags: MessageFlags.Ephemeral });
      return;
    }
    return handleSetupGo(interaction);
  }

  await interaction.reply({ content: '⚠️ That button is from an older version of this game.', flags: MessageFlags.Ephemeral });
}

export async function handleEscapeSelect(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ content: '❌ Only admins and moderators can set up Escape Velocity.', flags: MessageFlags.Ephemeral });
    return;
  }
  const guildId = interaction.guildId;
  const selection = interaction.customId === 'ev_setup_media'
    ? { media: interaction.values }
    : { genres: interaction.values };
  const result = setDraftSelection(guildId, selection);
  if (result.error) {
    await interaction.update({ content: '⚠️ This setup screen is out of date — the event was already scheduled.', embeds: [], components: [] });
    return;
  }
  await interaction.update(setupView(loadEvent(guildId)));
}
