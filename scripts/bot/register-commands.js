// Script to force register Discord slash commands
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { REST, Routes } from 'discord.js';
import { SlashCommandBuilder } from 'discord.js';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
let DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN not found in .env file');
  process.exit(1);
}

// Try to extract client ID from token if not provided
if (!DISCORD_CLIENT_ID) {
  console.log('⚠️  DISCORD_CLIENT_ID not found, attempting to extract from token...');
  
  // Discord bot tokens contain the client ID as the first part (base64url encoded)
  try {
    const parts = DISCORD_TOKEN.split('.');
    if (parts.length >= 1 && parts[0]) {
      try {
        // Convert base64 URL-safe to regular base64 and decode
        const buffer = Buffer.from(parts[0], 'base64url');
        DISCORD_CLIENT_ID = buffer.toString('utf-8');
        console.log(`✓ Extracted Client ID from token: ${DISCORD_CLIENT_ID}`);
      } catch (e) {
        // If that fails, the client ID might be in the token directly
        DISCORD_CLIENT_ID = parts[0];
        console.log(`✓ Using first part of token as Client ID: ${DISCORD_CLIENT_ID}`);
      }
    }
  } catch (e) {
    console.error('❌ Could not extract Client ID from token');
  }
  
  if (!DISCORD_CLIENT_ID) {
    console.error('\n❌ DISCORD_CLIENT_ID could not be determined');
    console.error('   Please add DISCORD_CLIENT_ID to your .env file');
    console.error('   Find it at: https://discord.com/developers/applications > Your App > General Information');
    process.exit(1);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Get price information for a Luminex token')
    .addStringOption(option =>
      option.setName('token')
        .setDescription('Token name, ticker, or symbol (e.g., BTC, Bitcoin)')
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('holders')
    .setDescription('View top holders for a Luminex token')
    .addStringOption(option =>
      option.setName('token')
        .setDescription('Token name, ticker, or symbol')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of holders to show (default: 10, max: 25)')
        .setMinValue(1)
        .setMaxValue(25)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('swaps')
    .setDescription('View recent swap activity for a Luminex token')
    .addStringOption(option =>
      option.setName('token')
        .setDescription('Token name, ticker, or symbol')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of swaps to show (default: 10, max: 25)')
        .setMinValue(1)
        .setMaxValue(25)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('chart')
    .setDescription('Get price chart for a Luminex token')
    .addStringOption(option =>
      option.setName('token')
        .setDescription('Token name, ticker, or symbol')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('timeframe')
        .setDescription('Chart timeframe')
        .setRequired(false)
        .addChoices(
          { name: '1 Hour (15min candles)', value: '1h' },
          { name: '6 Hours (15min candles)', value: '6h' },
          { name: '24 Hours (15min candles)', value: '24h' },
          { name: '7 Days (1h candles)', value: '7d' }
        )
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Get comprehensive token information')
    .addStringOption(option =>
      option.setName('token')
        .setDescription('Token name, ticker, or symbol')
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('Get real-time token list from API (sorted by volume)')
    .addIntegerOption(option =>
      option.setName('limit')
        .setDescription('Number of tokens to show (default: 10, max: 50)')
        .setMinValue(1)
        .setMaxValue(50)
    )
    .addIntegerOption(option =>
      option.setName('offset')
        .setDescription('Offset for pagination (default: 0)')
        .setMinValue(0)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');
    console.log(`   Client ID: ${DISCORD_CLIENT_ID}`);
    
    if (DISCORD_GUILD_ID) {
      console.log(`   Guild ID: ${DISCORD_GUILD_ID}`);
      console.log('   Registering to specific guild (INSTANT - commands appear immediately)...');
      
      const registeredCommands = await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commands },
      );
      
      console.log('✅ Successfully registered commands to guild!');
      
      // Set channel permissions if DISCORD_CHANNEL_ID is specified
      if (DISCORD_CHANNEL_ID) {
        console.log(`\n🔒 Setting command permissions to channel: ${DISCORD_CHANNEL_ID}...`);
        try {
          // Set permissions for all registered commands
          for (const command of registeredCommands) {
            await rest.put(
              Routes.applicationCommandPermissions(DISCORD_CLIENT_ID, DISCORD_GUILD_ID, command.id),
              {
                body: {
                  permissions: [
                    {
                      id: DISCORD_CHANNEL_ID,
                      type: 0, // CHANNEL type
                      permission: true, // Allow in this channel
                    },
                  ],
                },
              }
            );
          }
          console.log('✅ Commands restricted to specified channel!');
          console.log('   Commands will ONLY appear in that channel. Other channels will not see them.');
        } catch (permError) {
          console.error('⚠️  Could not set command permissions:', permError.message);
          console.error('   Commands will still work, but may appear in all channels.');
          console.error('   Make sure your bot has "Manage Server" permission.');
        }
      } else {
        console.log('   Commands will appear in all channels.');
        console.log('   💡 Add DISCORD_CHANNEL_ID to .env to restrict commands to one channel.');
      }
    } else {
      console.log('   Registering globally (may take up to 1 hour to appear)...');
      console.log('   💡 Tip: Add DISCORD_GUILD_ID to .env for instant command registration');
      
      await rest.put(
        Routes.applicationCommands(DISCORD_CLIENT_ID),
        { body: commands },
      );
      
      console.log('✅ Successfully registered commands globally!');
      console.log('   Commands may take up to 1 hour to appear in Discord.');
    }
    
    console.log(`\n📋 Registered ${commands.length} commands:`);
    commands.forEach(cmd => {
      console.log(`   - /${cmd.name}`);
    });
    
    console.log('\n💡 To see commands in Discord:');
    console.log('   1. Type "/" in a channel where the bot has access');
    console.log('   2. Wait a few seconds if you just registered');
    console.log('   3. If using guild registration, commands appear immediately');
    console.log('   4. If using global, wait up to 1 hour');
    
  } catch (error) {
    console.error('❌ Error registering commands:', error);
    if (error.code === 50001) {
      console.error('\n   Missing Access - Make sure your bot has the "applications.commands" scope');
      console.error('   Go to: https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=0&scope=bot%20applications.commands');
    } else if (error.code === 10004) {
      console.error('\n   Unknown Application - Check your DISCORD_CLIENT_ID in .env');
    } else if (error.code === 50013) {
      console.error('\n   Missing Permissions - Bot needs to be in the guild/server');
    }
  }
})();

