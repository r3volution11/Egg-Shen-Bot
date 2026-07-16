/**
 * Shared helper for delivering a search command's final result.
 *
 * Search commands (/movie, /tv, /episode, /game, etc.) always defer
 * ephemeral, since a multi-result picker shouldn't clutter the channel
 * while someone narrows down what they meant. But the final answer is the
 * whole point of running the command — everyone else in the channel should
 * be able to see it, unless the user explicitly asked to keep it private
 * (the `private:true` command option).
 *
 * editReply() can only ever edit the same ephemeral message in place, so
 * "make it public" isn't an edit — it's deleting the ephemeral message and
 * posting a brand-new public one in the channel.
 */

/**
 * Deliver a command's final response, respecting whether the user asked to
 * keep it private.
 *
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').StringSelectMenuInteraction} interaction
 * @param {object} response - Whatever editReply()/channel.send() accepts (embeds, content, components, etc.)
 * @param {boolean} isPrivate - true keeps the result on the ephemeral message; false (default) posts it publicly
 */
export async function deliverResult(interaction, response, isPrivate = false) {
  if (isPrivate) {
    await interaction.editReply(response);
    return;
  }

  // Posting publicly: remove the ephemeral message (if one exists to delete)
  // and send a fresh public message in the channel instead.
  if (interaction.deferred || interaction.replied) {
    await interaction.deleteReply().catch(() => {});
  } else if (interaction.message) {
    // Select-menu interactions reference the ephemeral picker via .message
    // rather than having a reply of their own to delete.
    await interaction.message.delete().catch(() => {});
  }

  await interaction.channel.send(response);
}

/**
 * Encode the `private` flag into a select-menu option's value string, so it
 * survives from the original slash command call through to the later
 * picker-selection interaction (selectHandler.js has no other way to know
 * what the original /movie call asked for).
 * @param {string} value - The base value (e.g. `movie_12345`)
 * @param {boolean} isPrivate
 * @returns {string}
 */
export function encodePrivateFlag(value, isPrivate) {
  return `${value}_${isPrivate ? '1' : '0'}`;
}

/**
 * Decode a value string built with encodePrivateFlag back into its base
 * value and the original private flag.
 * @param {string} encodedValue
 * @returns {{ value: string, isPrivate: boolean }}
 */
export function decodePrivateFlag(encodedValue) {
  const lastUnderscore = encodedValue.lastIndexOf('_');
  const flag = encodedValue.slice(lastUnderscore + 1);
  const value = encodedValue.slice(0, lastUnderscore);
  return { value, isPrivate: flag === '1' };
}
