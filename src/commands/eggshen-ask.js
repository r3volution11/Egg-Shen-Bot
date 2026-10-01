import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig, isAdmin } from '../utils/guildConfig.js';
import { answerQuestion } from '../utils/docsAnswer.js';
import { deliverResult } from '../utils/interactionResponse.js';
import { ADMIN_SUBCOMMANDS } from './bracket.js';

/**
 * /eggshen-ask — "how do I…" in plain words, answered from the bot's own
 * documentation with the exact commands to run. See docsAnswer.js.
 *
 * Private by default: a question is usually just for the asker, and answers
 * in the channel would bury conversation. `public:true` posts it for
 * everyone, e.g. when helping someone else. (Most commands default public
 * with a `private` option; /timer status's `public` is the precedent for
 * this way round.)
 */
export const data = new SlashCommandBuilder()
  .setName('eggshen-ask')
  .setDescription('Ask how to do something with the bot, answered from its documentation')
  .addStringOption(option =>
    option
      .setName('question')
      .setDescription('e.g. "How do I start a tournament with 16 titles?"')
      .setRequired(true)
      .setMaxLength(300)
  )
  .addBooleanOption(option =>
    option
      .setName('public')
      .setDescription('Post the answer in this channel for everyone (default: only you see it)')
      .setRequired(false)
  );

const MODE_FOOTER = {
  ai: 'Written with AI from the Egg Shen Bot docs • Check the linked page for details',
  search: 'Best match in the Egg Shen Bot docs',
  none: 'Egg Shen Bot docs',
};

export async function execute(interaction) {
  const question = interaction.options.getString('question').trim();
  // getBoolean returns null when unset; `|| false` would be fine here, but
  // `?? false` matches how /timer status reads its `public`
  const isPublic = interaction.options.getBoolean('public') ?? false;

  await interaction.deferReply({ ephemeral: true });

  const guildConfig = await loadGuildConfig(interaction.guildId);
  const member = interaction.member;
  const isManager = isAdmin(member)
    || member?.permissions?.has?.(PermissionFlagsBits.Administrator)
    || member?.permissions?.has?.(PermissionFlagsBits.ModerateMembers);

  const result = await answerQuestion({
    question,
    guildConfig,
    commands: interaction.client?.commands?.values?.() || [],
    isManager,
    adminSubcommands: { bracket: ADMIN_SUBCOMMANDS },
  });

  const description = [
    result.answer,
    result.adminNote ? '\n🔒 Some of this needs an administrator or moderator.' : '',
  ].join('').slice(0, 4000);

  const embed = new EmbedBuilder()
    .setColor(result.mode === 'none' ? 0xFEE75C : 0x4EC5ED)
    .setTitle(`🤔 ${question}`.slice(0, 256))
    .setDescription(description)
    .setFooter({ text: MODE_FOOTER[result.mode] });

  if (result.sources.length) {
    embed.addFields({ name: '📖 From the docs', value: result.sources.join('\n').slice(0, 1024) });
  }

  await deliverResult(interaction, { embeds: [embed] }, !isPublic);
}
