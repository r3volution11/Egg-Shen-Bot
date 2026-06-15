import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { config } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Collection to store commands
client.commands = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`✓ Loaded command: ${command.data.name}`);
  } else {
    console.warn(`⚠ Command at ${filePath} is missing required "data" or "execute" property`);
  }
}

// Event: Bot ready
client.once('ready', () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
  console.log(`✓ Serving ${client.guilds.cache.size} guilds`);
});

// Event: Interaction (slash commands)
client.on('interactionCreate', async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle button interactions (for result selection)
  else if (interaction.isButton()) {
    const { handleButtonInteraction } = await import('./handlers/buttonHandler.js');
    await handleButtonInteraction(interaction);
  }
  
  // Handle select menu interactions
  else if (interaction.isStringSelectMenu()) {
    const { handleSelectInteraction } = await import('./handlers/selectHandler.js');
    await handleSelectInteraction(interaction);
  }
});

// Login
client.login(config.discord.token);
