import { MessageFlags } from 'discord.js';
import * as logger from '../utils/logger.js';
import { rememberCommand } from '../utils/commandEcho.js';

/**
 * Whether an interaction is one dispatchCommand handles. A named function
 * rather than an inline condition in index.js so a test can hold it: when
 * only chat-input was accepted, right-clicking a member did nothing at all —
 * Discord showed "This interaction failed" and the logs showed nothing.
 */
export function isCommandInteraction(interaction) {
  return interaction.isChatInputCommand() || interaction.isUserContextMenuCommand();
}

/**
 * Run a slash command or a right-click user command ("Game card").
 *
 * Lives here rather than inline in src/index.js so a test can drive an
 * interaction through the exact path production uses — lookup, rate limit,
 * echo, execute, error reply. Inline, none of it could be reached without
 * logging a bot in.
 *
 * @param {object} interaction - a chat-input or user-context-menu interaction
 * @param {Map<string, {execute: Function}>} commands - client.commands
 */
export async function dispatchCommand(interaction, commands) {
  const command = commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  // A right-click command is named "Game card" — capitals and a space, which
  // no slash command can have — has no subcommand, and carries its one
  // option (`user`) in options.data like any other, so every step below
  // works for both. What differs is only what's marked here.
  const isSlash = interaction.isChatInputCommand();

  try {
    // Check rate limits
    const { checkRateLimit } = await import('../utils/rateLimiter.js');

    // Serialize command arguments for pattern detection
    const commandArgs = interaction.options.data
      .map(opt => `${opt.name}:${opt.value}`)
      .join(' ');

    const rateCheck = await checkRateLimit(
      interaction.guildId,
      interaction.user.id,
      interaction.commandName,
      interaction.member,
      commandArgs
    );

    if (rateCheck.limited) {
      await interaction.reply({
        content: `⏱️ ${rateCheck.message}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Remembered before execute so a public result — even one delivered
    // later from a picker — can say which command produced it. Slash only:
    // the echo is a </name:id> mention, and a context-menu command can't be
    // mentioned (nor is its result ever public).
    if (isSlash) rememberCommand(interaction);

    const startTime = Date.now();
    await command.execute(interaction);
    const duration = Date.now() - startTime;

    // Log successful command execution
    logger.logCommand(
      interaction.commandName,
      interaction.user,
      interaction.guild,
      {
        subcommand: interaction.options.getSubcommand?.(false),
        channelId: interaction.channelId,
        duration,
        ...(isSlash ? {} : { userMenu: true }),
      },
      true
    );

    // Log slow commands
    if (duration > 3000) {
      logger.logPerformance(
        `Command: ${isSlash ? '/' : ''}${interaction.commandName}`,
        duration,
        {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        }
      );
    }
  } catch (error) {
    console.error('Command execution error:', error);

    // Log command error
    logger.logCommand(
      interaction.commandName,
      interaction.user,
      interaction.guild,
      {
        subcommand: interaction.options.getSubcommand?.(false),
        channelId: interaction.channelId,
        ...(isSlash ? {} : { userMenu: true }),
      },
      false,
      error
    );

    const errorMessage = { content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    } catch (replyError) {
      console.error('Failed to send error message to user:', replyError.message);
      logger.error(logger.LogCategory.COMMAND, 'Failed to send error message to user', {
        originalError: error.message,
        replyError: replyError.message,
        userId: interaction.user.id
      });
    }
  }
}
