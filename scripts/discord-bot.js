const { Client, GatewayIntentBits, Events, Collection, REST, Routes, ApplicationCommandOptionType } = require('discord.js');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const VERIFY_API_URL = process.env.NEXT_PUBLIC_VERIFY_API_URL || 'https://thedamned.xyz/api/verify';

// Slash command handler
client.commands = new Collection();

const verifyCommand = {
  name: 'verify',
  description: 'Verify your wallet or get instructions',
  options: [
    {
      name: 'code',
      type: ApplicationCommandOptionType.String,
      description: 'Your verification code (leave empty for instructions)',
      required: false,
    },
  ],
};

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),                                                                             
      { body: [verifyCommand] }
    );

    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verify') {
    const code = interaction.options.getString('code');

    await interaction.deferReply({ ephemeral: true });

    // If no code provided, show instructions
    if (!code) {
      const websiteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz';
      await interaction.editReply({
        content: `📋 **How to Verify Your Wallet**\n\n` +
          `1️⃣ Go to: ${websiteUrl}\n` +
          `2️⃣ Connect your wallet\n` +
          `3️⃣ Get your verification code\n` +
          `4️⃣ Use: \`/verify code:\` and paste your code\n\n` +
          `*Example: \`/verify code: ABC12345\``,
      });
      return;
    }

        try {
      // Call the verify API endpoint
      console.log(`Attempting to verify code: ${code}`);
      const response = await fetch(`${VERIFY_API_URL}?code=${encodeURIComponent(code)}`);
      
      if (!response.ok) {
        console.error(`API returned error status: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`Error response: ${errorText}`);
        await interaction.editReply({
          content: `❌ **API Error**\n\nThe verification server returned an error (${response.status}). Please try again later.`,
        });
        return;
      }

      const data = await response.json();
      console.log(`API response:`, JSON.stringify(data));

      if (data.valid && data.address) {
        // User is verified - assign the holder role
        const member = interaction.member;
        const role = interaction.guild.roles.cache.get(process.env.HOLDER_ROLE_ID);

                if (role) {
          // Check if user already has the role
          if (member.roles.cache.has(role.id)) {
            await interaction.editReply({
              content: `✅ **You're already verified!**\n\nYou already have the holder role.\nYour address: \`${data.address}\``,
            });
            console.log(`User ${interaction.user.tag} (${interaction.user.id}) already has the role`);
            return;
          }

          // Check bot permissions
          const botMember = interaction.guild.members.cache.get(client.user.id);
          if (!botMember.permissions.has('ManageRoles')) {
            console.error('Bot does not have ManageRoles permission');
            await interaction.editReply({
              content: '✅ Verification successful, but the bot does not have permission to assign roles. Please contact an administrator.',
            });
            return;
          }

          // Check role hierarchy (bot's highest role must be higher than the role to assign)
          const botHighestRole = botMember.roles.highest;
          if (botHighestRole.comparePositionTo(role) <= 0) {
            console.error(`Bot's role (${botHighestRole.name}) is not higher than holder role (${role.name})`);
            await interaction.editReply({
              content: '✅ Verification successful, but the bot\'s role is not high enough in the role hierarchy. Please contact an administrator.',
            });
            return;
          }

          try {
            await member.roles.add(role);
            await interaction.editReply({
              content: `✅ **Verification successful!**\n\nYou've been verified as a holder of The Damned ordinals.\nYour address: \`${data.address}\`\n\nThe holder role has been assigned to you.`,
            });
            console.log(`✅ Verified user ${interaction.user.tag} (${interaction.user.id}) with address ${data.address}`);
          } catch (error) {
            console.error('Error assigning role:', error);
            console.error('Error details:', error.message, error.code);
            await interaction.editReply({
              content: `✅ Verification successful, but there was an error assigning your role: ${error.message}\n\nPlease contact an administrator.`,
            });
          }
        } else {
          console.error(`Holder role with ID ${process.env.HOLDER_ROLE_ID} not found in guild`);
          await interaction.editReply({
            content: '✅ Verification successful, but the holder role was not found. Please contact an administrator.',
          });
        }
      } else {
        // Verification failed
        await interaction.editReply({
          content: `❌ **Verification failed**\n\n${data.message || 'Invalid or expired verification code. Please generate a new code from the website.'}`,
        });
      }
    } catch (error) {
      console.error('Error during verification:', error);
      console.error('Error stack:', error.stack);
      console.error('Error message:', error.message);
      await interaction.editReply({
        content: `❌ **Error occurred**\n\nAn error occurred during verification: ${error.message}\n\nPlease ensure the verification server is running and try again.`,
      });
    }
  }
});

// Bot ready event
client.once(Events.ClientReady, async () => {
  console.log(`✅ Discord bot is ready! Logged in as ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`Verify API URL: ${VERIFY_API_URL}`);
  console.log(`Guild ID: ${process.env.GUILD_ID}`);
  console.log(`Client ID: ${process.env.CLIENT_ID}`);
  console.log(`Holder Role ID: ${process.env.HOLDER_ROLE_ID}`);
  await registerCommands();
});

// Error handling
client.on(Events.Error, error => {
  console.error('Discord client error:', error);
});

// Verify environment variables before login
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ ERROR: DISCORD_TOKEN is not set in .env.local');
  process.exit(1);
}
if (!process.env.GUILD_ID) {
  console.error('❌ ERROR: GUILD_ID is not set in .env.local');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  console.error('❌ ERROR: CLIENT_ID is not set in .env.local');
  process.exit(1);
}
if (!process.env.HOLDER_ROLE_ID) {
  console.error('❌ ERROR: HOLDER_ROLE_ID is not set in .env.local');
  process.exit(1);
}

console.log('🚀 Starting Discord bot...');
// Login to Discord
client.login(process.env.DISCORD_TOKEN);
