import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { config } from '../config.js';
import { canGenerateImage, recordImageGeneration } from '../utils/aiImageTracker.js';
import { isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('image')
  .setDescription('Generate AI images using OpenAI')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Describe the image you want to generate')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('Username or message ID to generate image from')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Defer with ephemeral to hide the command from other users
  await interaction.deferReply({ ephemeral: true });

  // Check rate limits
  const userIsAdmin = await isAdmin(interaction.member);
  const rateCheck = canGenerateImage(interaction.guildId, interaction.user.id, userIsAdmin);
  
  if (!rateCheck.allowed) {
    return await interaction.editReply(`❌ ${rateCheck.reason}`);
  }

  const prompt = interaction.options.getString('prompt');
  const messageInput = interaction.options.getString('message');

  // Validate that at least one option is provided
  if (!prompt && !messageInput) {
    return await interaction.editReply('❌ Please provide either a `prompt` or `message` option.');
  }

  // If both are provided, combine them
  if (prompt && messageInput) {
    return await interaction.editReply('❌ Please provide only one option: either `prompt` or `message`, not both.');
  }

  let finalPrompt = prompt;

  // If message option is provided, fetch the message content
  if (messageInput) {
    try {
      let targetMessage = null;

      // Check if it's a message ID (snowflake - all digits)
      if (/^\d{17,19}$/.test(messageInput)) {
        targetMessage = await interaction.channel.messages.fetch(messageInput);
      } else {
        // Treat as username - search recent messages
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        
        // Find the most recent message from this user (case-insensitive)
        const username = messageInput.toLowerCase();
        targetMessage = messages.find(msg => 
          msg.author.username.toLowerCase() === username ||
          msg.author.tag.toLowerCase() === username ||
          msg.author.displayName?.toLowerCase() === username
        );

        if (!targetMessage) {
          return await interaction.editReply(`❌ Could not find a recent message from user "${messageInput}". Try using a message ID instead.`);
        }
      }

      if (!targetMessage.content || targetMessage.content.trim() === '') {
        return await interaction.editReply('❌ The selected message has no text content to generate an image from.');
      }

      finalPrompt = targetMessage.content;
      
      // Add context about where the prompt came from
      await interaction.editReply(`🎨 Generating image from **${targetMessage.author.username}**'s message...\n\n_Message: "${finalPrompt.substring(0, 200)}${finalPrompt.length > 200 ? '...' : ''}"_\n\n_This may take 10-30 seconds..._`);
    } catch (error) {
      console.error('Error fetching message:', error);
      return await interaction.editReply('❌ Failed to fetch the specified message. Make sure the message ID is correct and in this channel.');
    }
  } else {
    await interaction.editReply(`🎨 Generating image...\n\n_Prompt: "${finalPrompt.substring(0, 200)}${finalPrompt.length > 200 ? '...' : ''}"_\n\n_This may take 10-30 seconds..._`);
  }

  // Generate the image with OpenAI
  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apis.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-2', // OpenAI's latest image model (formerly dall-e-3)
        prompt: finalPrompt,
        n: 1,
        size: '1024x1024', // Square format for general images
        quality: 'medium', // Options: 'low', 'medium', 'high', or 'auto'
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('[OpenAI Response] Full response:', JSON.stringify(data, null, 2));
    
    // Check for different response formats
    let imageUrl;
    if (data.data && data.data[0]) {
      if (data.data[0].url) {
        imageUrl = data.data[0].url;
        console.log('[OpenAI Response] Found URL:', imageUrl);
      } else if (data.data[0].b64_json) {
        console.log('[OpenAI Response] Received base64 data, converting to buffer...');
        // Convert base64 to buffer directly
        const imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
        
        // Record the image generation
        recordImageGeneration(interaction.guildId, interaction.user.id, 'image', {
          prompt: finalPrompt.substring(0, 200),
          messageSource: messageInput || null,
        });

        // Create embed with the generated image
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('🎨 AI Generated Image')
          .setDescription(`**Prompt:** ${finalPrompt.substring(0, 500)}${finalPrompt.length > 500 ? '...' : ''}`)
          .setImage('attachment://ai-image.png')
          .setFooter({ text: 'Generated by OpenAI' })
          .setTimestamp();

        const attachment = new AttachmentBuilder(imageBuffer, { name: 'ai-image.png' });

        // Send the image publicly to the channel
        await interaction.channel.send({
          embeds: [embed],
          files: [attachment]
        });
        
        // Update the ephemeral reply to confirm
        await interaction.editReply('✅ Image generated and posted to the channel!');
        return;
      } else {
        console.error('[OpenAI Response] Unknown format:', data);
        throw new Error('Invalid response from OpenAI - unexpected format');
      }
    } else {
      console.error('[OpenAI Response] Missing data array:', data);
      throw new Error('Invalid response from OpenAI - missing data');
    }
    
    // If we have a URL, download it
    // If we have a URL, download it
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download generated image');
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Record the image generation
    recordImageGeneration(interaction.guildId, interaction.user.id, 'image', {
      prompt: finalPrompt.substring(0, 200),
      messageSource: messageInput || null,
    });

    // Create embed with the generated image
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🎨 AI Generated Image')
      .setDescription(`**Prompt:** ${finalPrompt.substring(0, 500)}${finalPrompt.length > 500 ? '...' : ''}`)
      .setImage('attachment://ai-image.png')
      .setFooter({ text: 'Generated by OpenAI' })
      .setTimestamp();

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'ai-image.png' });

    // Send the image publicly to the channel
    await interaction.channel.send({
      embeds: [embed],
      files: [attachment]
    });
    
    // Update the ephemeral reply to confirm
    await interaction.editReply('✅ Image generated and posted to the channel!');

  } catch (error) {
    console.error('Error generating AI image:', error);
    await interaction.editReply(`❌ Failed to generate AI image: ${error.message}`);
  }
}
