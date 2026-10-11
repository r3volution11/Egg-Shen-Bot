import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { execute as runBracketSubcommand, GROUP_LETTERS } from './bracket.js';

/**
 * /bracket-setup — everything done before voting starts: create, the setup
 * form link, adding titles, groups, name, announcement.
 *
 * Split out of /bracket in 2.62.0, which had reached 7841 of Discord's 8000
 * bytes per command definition. Split by phase, not audience: everything
 * used while a tournament runs (open, close, status, voting) stayed on
 * /bracket, so a tournament already underway notices nothing.
 *
 * The handlers live in bracket.js and run through its execute(), so the
 * per-server toggle (`commands.bracket`, shared by both commands) and the
 * admin/mod check are the same code for both. Every subcommand here is in
 * bracket.js's ADMIN_SUBCOMMANDS.
 */
export const data = new SlashCommandBuilder()
  .setName('bracket-setup')
  .setDescription('🏆 Set up a tournament: create it, add titles, name and announce it (Admin/Mod only)')
  // Hidden from members who can't use it. One bit, matching the in-code gate
  // (Administrator or Moderate Members; Discord lets Administrators see every
  // command). Server owners can change it in Server Settings → Integrations;
  // execute() still checks either way.
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new tournament')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Tournament name (e.g., "The Ultimate Horror Cup")')
          .setRequired(true)
          // The name is interpolated into embed titles, which Discord caps at
          // 256 — and the longest of those prefixes it with "📊 Group A
          // Results - ". Without a cap, an over-long name makes .setTitle()
          // throw inside tournamentScheduler's auto-close, where the outer
          // try/catch swallows it and group voting silently never closes.
          .setMaxLength(100)
      )
      .addIntegerOption(option =>
        option
          .setName('max-titles')
          .setDescription('Max titles (2-32: bracket, 36-48: groups)')
          .setRequired(false)
          .addChoices(
            { name: '2 titles (Finals only)', value: 2 },
            { name: '4 titles (Semifinals)', value: 4 },
            { name: '8 titles (Quarterfinals)', value: 8 },
            { name: '16 titles (Round of 16)', value: 16 },
            { name: '32 titles (Round of 32)', value: 32 },
            { name: '36 titles (9 groups)', value: 36 },
            { name: '40 titles (10 groups)', value: 40 },
            { name: '44 titles (11 groups)', value: 44 },
            { name: '48 titles (12 groups)', value: 48 }
          )
      )
      .addStringOption(option =>
        option
          .setName('seeding')
          .setDescription('How titles are seeded (default random)')
          .addChoices(
            { name: 'Random', value: 'random' },
            { name: 'The order I add them', value: 'ordered' },
            { name: 'By rating', value: 'rating' }
          )
      )
      .addStringOption(option =>
        option
          .setName('ties')
          .setDescription('What a tied matchup does (default runoff)')
          .addChoices(
            { name: 'Runoff vote', value: 'runoff' },
            { name: 'Higher seed wins', value: 'higher-seed' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup-link')
      .setDescription('Private link to set up the tournament on the web, from a CSV/JSON file')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('manage-titles')
      .setDescription('Add or remove titles from groups')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('Action to perform')
          .setRequired(true)
          .addChoices(
            { name: 'Add Title', value: 'add' },
            { name: 'Remove Title', value: 'remove' }
          )
      )
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter (auto-assigned in bracket mode)')
          .setRequired(false)
          .addChoices(...GROUP_LETTERS.map(letter => ({ name: `Group ${letter}`, value: letter })))
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Tournament type (required for adding)')
          .setRequired(false)
          .addChoices(
            { name: 'Movies', value: 'movie' },
            { name: 'TV Shows', value: 'tv' },
            { name: 'Video Games', value: 'game' },
            { name: 'Board Games', value: 'boardgame' },
            { name: 'Books', value: 'book' }
          )
      )
      .addStringOption(option =>
        option.setName('title').setDescription('Title to search for and add (required for adding)').setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('position')
          .setDescription('Number to remove, from /bracket list-groups (required for removing)')
          .setRequired(false)
          .setMinValue(1)
          // 32, not 4: bracket mode numbers its whole list; groups mode validates 1-4 itself
          .setMaxValue(32)
      )
      .addAttachmentOption(option =>
        option
          .setName('image')
          .setDescription('Optional: Custom image (for adding only)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('resize')
      .setDescription('Change the number of groups before voting begins')
      .addIntegerOption(option =>
        option
          .setName('groups')
          .setDescription('New number of groups (4-12)')
          .setRequired(true)
          .setMinValue(4)
          .setMaxValue(12)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit-name')
      .setDescription('Rename the tournament')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('New tournament name')
          .setRequired(true)
          .setMaxLength(100) // Same embed-title ceiling as `create`.
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('announce')
      .setDescription('Announce the tournament to the channel')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Announcement message to the server')
          .setRequired(false)
          .setMaxLength(1000) // Goes into an embed description (Discord caps at 4096).
      )
      .addAttachmentOption(option =>
        option
          .setName('image')
          .setDescription('Optional tournament banner/image')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  return runBracketSubcommand(interaction);
}
