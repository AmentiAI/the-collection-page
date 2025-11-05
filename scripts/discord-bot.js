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

const checkHoldersCommand = {
  name: 'checkholders',
  description: 'Check all holders and remove roles from those who no longer have ordinals (Admin only)',
};

const checkinCommand = {
  name: 'checkin',
  description: 'Check in daily to receive +5 karma points (once every 24 hours)',
};

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),                                                                             
      { body: [verifyCommand, checkHoldersCommand, checkinCommand] }
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
            
            // Link Discord user to wallet address in database
            try {
              const linkResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/discord/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  discordUserId: interaction.user.id,
                  walletAddress: data.address
                })
              });
              
              if (linkResponse.ok) {
                console.log(`✅ Linked Discord user ${interaction.user.id} to wallet ${data.address}`);
              } else {
                console.error(`Failed to link Discord user: ${linkResponse.status}`);
              }
            } catch (linkError) {
              console.error('Error linking Discord user:', linkError);
            }
            
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
  
  // Handle checkholders command
  if (interaction.commandName === 'checkholders') {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
      await interaction.reply({
        content: '❌ **Permission Denied**\n\nYou must have Administrator permissions to use this command.',
        ephemeral: true
      });
      return;
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/holders/check`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        await interaction.editReply({
          content: `❌ **Error**\n\nFailed to check holders: ${response.status}`,
        });
        return;
      }
      
      const data = await response.json();
      const role = interaction.guild.roles.cache.get(process.env.HOLDER_ROLE_ID);
      
      if (!role) {
        await interaction.editReply({
          content: '❌ **Error**\n\nHolder role not found.',
        });
        return;
      }
      
      let removedCount = 0;
      let errorCount = 0;
      
      // Remove roles from users who no longer have ordinals
      for (const user of data.usersToRemoveRole || []) {
        try {
          const member = await interaction.guild.members.fetch(user.discordUserId);
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            removedCount++;
            console.log(`Removed holder role from ${member.user.tag} (${user.discordUserId})`);
          }
        } catch (error) {
          console.error(`Error removing role from ${user.discordUserId}:`, error);
          errorCount++;
        }
      }
      
      await interaction.editReply({
        content: `✅ **Holder Check Complete**\n\n` +
          `Checked: ${data.totalChecked} holders\n` +
          `Removed roles: ${removedCount} users\n` +
          `Errors: ${errorCount}\n\n` +
          `Users who no longer have ordinals have been removed from the holder role.`,
      });
    } catch (error) {
      console.error('Error checking holders:', error);
      await interaction.editReply({
        content: `❌ **Error**\n\nAn error occurred: ${error.message}`,
      });
    }
  }
  
  // Handle checkin command
  if (interaction.commandName === 'checkin') {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/checkin`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordUserId: interaction.user.id
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        await interaction.editReply({
          content: errorData.message || `❌ **Error**\n\nFailed to check in: ${response.status}`,
        });
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        await interaction.editReply({
          content: data.message || `✅ **Check-in Successful!**\n\nYou received **+${data.karmaAwarded} karma points** for checking in today.\n\nCome back in 24 hours to check in again!`,
        });
      } else {
        // Cooldown message
        const hoursRemaining = data.hoursRemaining || 0;
        const nextCheckin = data.nextCheckin ? new Date(data.nextCheckin).toLocaleString() : '24 hours';
        await interaction.editReply({
          content: data.message || `⏰ **Check-in Cooldown**\n\nYou can check in again in ${hoursRemaining} hour(s).\n\nNext check-in available: ${nextCheckin}`,
        });
      }
    } catch (error) {
      console.error('Error during check-in:', error);
      await interaction.editReply({
        content: `❌ **Error**\n\nAn error occurred during check-in: ${error.message}`,
      });
    }
  }
});

// Periodic job to check holders and remove roles (runs every hour)
setInterval(async () => {
  try {
    console.log('🔄 Running periodic holder check...');
    const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/holders/check`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error('Failed to check holders:', response.status);
      return;
    }
    
    const data = await response.json();
    
    if (data.usersToRemoveRole && data.usersToRemoveRole.length > 0) {
      const guild = client.guilds.cache.get(process.env.GUILD_ID);
      if (!guild) {
        console.error('Guild not found');
        return;
      }
      
      const role = guild.roles.cache.get(process.env.HOLDER_ROLE_ID);
      if (!role) {
        console.error('Holder role not found');
        return;
      }
      
      // Remove roles from users who no longer have ordinals
      for (const user of data.usersToRemoveRole) {
        try {
          const member = await guild.members.fetch(user.discordUserId);
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            console.log(`✅ Removed holder role from ${member.user.tag} (${user.discordUserId}) - no longer has ordinals`);
          }
        } catch (error) {
          console.error(`Error removing role from ${user.discordUserId}:`, error);
        }
      }
      
      console.log(`✅ Periodic check complete: Removed ${data.usersToRemoveRole.length} holder roles`);
    } else {
      console.log('✅ Periodic check complete: All holders still have ordinals');
    }
  } catch (error) {
    console.error('Error in periodic holder check:', error);
  }
}, 3600000); // Run every hour (3600000 ms)

// Periodic job to check for missed check-ins and apply -5 karma penalty (runs every 24 hours)
setInterval(async () => {
  try {
    console.log('🔄 Running missed check-in penalty check...');
    const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/checkin/penalty`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      console.error('Failed to check missed check-ins:', response.status);
      return;
    }
    
    const data = await response.json();
    if (data.penaltiesApplied > 0) {
      console.log(`✅ Missed check-in penalty check complete: Applied -5 karma to ${data.penaltiesApplied} user(s)`);
    } else {
      console.log('✅ Missed check-in penalty check complete: No penalties needed');
    }
  } catch (error) {
    console.error('Error in missed check-in penalty check:', error);
  }
}, 86400000); // Run every 24 hours (86400000 ms)

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
