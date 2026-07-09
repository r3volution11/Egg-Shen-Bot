import { REST, Routes } from 'discord.js';
import { config } from './src/config.js';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

const rest = new REST().setToken(config.discord.token);

(async () => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
      console.error('❌ GUILD_ID is not set. Set it in .env or pass it as an environment variable before running this script.');
      process.exit(1);
    }

    console.log(`Deleting all guild-specific commands from server: ${guildId}`);
    
    // Delete all guild commands
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, guildId),
      { body: [] }
    );
    
    console.log('✅ Successfully deleted all guild-specific commands!');
    console.log('✅ Global commands will still be available (they appear once).');
    console.log('');
    console.log('Note: If you want to re-deploy guild commands for faster testing:');
    console.log('1. Set GUILD_ID in .env');
    console.log('2. Run: node src/deploy-commands.js');
  } catch (error) {
    console.error('❌ Error deleting commands:', error);
  }
})();
