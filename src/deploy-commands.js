import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

// Load environment variables
dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Define API requirements for commands
const commandRequirements = {
  'game': { key: 'RAWG_API_KEY', service: 'RAWG' },
  'boardgame': { key: 'BGG_CLIENT_ID', service: 'BoardGameGeek' },
};

// Load all commands
for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if ('data' in command) {
    const commandName = command.data.name;
    
    // Check if this command has API requirements
    if (commandRequirements[commandName]) {
      const requirement = commandRequirements[commandName];
      const apiKey = process.env[requirement.key];
      
      if (!apiKey) {
        console.log(`⊘ Skipped command: ${commandName} (${requirement.service} API not configured)`);
        continue;
      }
    }
    
    commands.push(command.data.toJSON());
    console.log(`✓ Loaded command: ${command.data.name}`);
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(config.discord.token);

// Deploy commands
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    let data;
    if (config.discord.guildId) {
      // Deploy to specific guild (faster for testing)
      data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      console.log(`✓ Successfully deployed ${data.length} commands to guild ${config.discord.guildId}`);
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      data = await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log(`✓ Successfully deployed ${data.length} commands globally`);
    }
    process.exit(0);
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
})();
