// Discord price fetching bot for Luminex tokens
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, AttachmentBuilder } from 'discord.js';
import axios from 'axios';
import * as db from './database.js';
import { fetchChartData, generateChartImage } from './chart-generator.js';

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const LUMINEX_API_URL = process.env.LUMINEX_API_URL || 'https://api.luminex.io/spark';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ALLOWED_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // Optional: restrict to one channel

if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (ALLOWED_CHANNEL_ID) {
  console.log(`✓ Bot will only respond in channel: ${ALLOWED_CHANNEL_ID}`);
}

// Extract client ID from token if not provided
function getClientId() {
  if (process.env.DISCORD_CLIENT_ID) {
    return process.env.DISCORD_CLIENT_ID;
  }
  // Try to extract from bot token (format: <client_id>.<timestamp>.<hash>)
  const parts = DISCORD_TOKEN.split('.');
  if (parts.length >= 1 && parts[0]) {
    try {
      // Convert base64 URL-safe to regular base64 and decode
      const buffer = Buffer.from(parts[0], 'base64url');
      return buffer.toString('utf-8');
    } catch (e) {
      // If that fails, try using the first part directly (might be the client ID)
      return parts[0];
    }
  }
  return null;
}

// Initialize Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Fetch tokens from pools endpoint with pagination
async function fetchAllTokens() {
  const allTokens = [];
  const limit = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${LUMINEX_API_URL}/tokens-with-pools?offset=${offset}&limit=${limit}&sort_by=agg_volume_24h_usd&order=desc`;
      
      const res = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      });

      const data = res.data;
      const tokens = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      
      if (tokens.length === 0) {
        hasMore = false;
        break;
      }

      allTokens.push(...tokens);
      
      // If we got less than limit, we're done
      if (tokens.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay between requests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Error fetching tokens at offset ${offset}:`, error.message);
      if (error.response?.status === 403) {
        console.error('  → Cloudflare 403 error. Will retry later.');
      }
      hasMore = false;
      break;
    }
  }

  return allTokens;
}

// Update database with fetched tokens
async function updateTokenDatabase() {
  try {
    console.log(`[${new Date().toISOString()}] Fetching tokens from Luminex API...`);
    const tokens = await fetchAllTokens();
    
    if (tokens.length === 0) {
      console.log('  → No tokens fetched. Skipping database update.');
      return;
    }

    console.log(`  → Fetched ${tokens.length} tokens. Updating database...`);
    
    let inserted = 0;
    let updated = 0;

    for (const token of tokens) {
      try {
        // Extract pool_lp_pubkey from pools array if available
        // Pool data might be nested in different ways
        let poolLpPubkey = token.pool_lp_pubkey;
        let poolAddress = token.pool_address;
        
        if (!poolLpPubkey && token.pools) {
          if (Array.isArray(token.pools) && token.pools.length > 0) {
            poolLpPubkey = token.pools[0]?.lp_pubkey || token.pools[0]?.pubkey;
            poolAddress = token.pools[0]?.address;
          } else if (token.pools.lp_pubkey) {
            poolLpPubkey = token.pools.lp_pubkey;
            poolAddress = token.pools.address;
          }
        }

        const tokenData = {
          pubkey: token.pubkey || token.token_identifier || token.token_address,
          token_identifier: token.token_identifier || token.token_address,
          token_address: token.token_address || token.token_identifier,
          name: token.name,
          ticker: token.ticker || token.symbol,
          symbol: token.symbol || token.ticker,
          decimals: token.decimals,
          icon_url: token.icon_url,
          holder_count: token.holder_count,
          total_supply: token.total_supply,
          max_supply: token.max_supply,
          is_freezable: token.is_freezable,
          pool_lp_pubkey: poolLpPubkey,
          pool_address: poolAddress,
          price_usd: token.price_usd || token.agg_price_usd,
          agg_volume_24h_usd: token.agg_volume_24h_usd,
          agg_liquidity_usd: token.agg_liquidity_usd,
          agg_price_change_24h_pct: token.agg_price_change_24h_pct,
        };

        const result = db.upsertToken(tokenData);
        if (result.changes === 0) {
          updated++;
        } else if (result.lastInsertRowid) {
          inserted++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`  → Error upserting token ${token.ticker || token.name}:`, err.message);
      }
    }

    const total = db.getTokenCount();
    console.log(`  ✓ Database updated: ${inserted} new, ${updated} updated. Total tokens: ${total}`);
  } catch (error) {
    console.error(`Error updating token database:`, error.message);
  }
}

// Fetch single token details (for /price command)
async function fetchTokenDetails(poolLpPubkey, tokenIdentifier) {
  const results = {
    comments: null,
    priceChanges: null,
    swaps: null,
    holders: null,
  };

  // Fetch comments if pool_lp_pubkey is available
  if (poolLpPubkey) {
    try {
      const commentsRes = await axios.get(
        `${LUMINEX_API_URL}/spark-comments?pool_lp_pubkey=${poolLpPubkey}&limit=20&offset=0`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        }
      );
      results.comments = commentsRes.data?.data || [];
    } catch (error) {
      console.error(`Could not fetch comments:`, error.message);
    }

    // Fetch recent swaps
    try {
      const swapsRes = await axios.get(
        `${LUMINEX_API_URL}/spark/swaps?poolLpPubkey=${poolLpPubkey}&limit=10`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        }
      );
      results.swaps = swapsRes.data?.data || [];
    } catch (error) {
      console.error(`Could not fetch swaps:`, error.message);
    }
  }

  // Fetch price changes if token_identifier is available
  if (tokenIdentifier) {
    try {
      const priceChangesRes = await axios.get(
        `https://api.luminex.io/spark/pools/${tokenIdentifier}/price-changes`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        }
      );
      results.priceChanges = priceChangesRes.data;
    } catch (error) {
      console.error(`Could not fetch price changes:`, error.message);
    }

    // Fetch holders if token_identifier is available
    try {
      const holdersRes = await axios.get(
        `${LUMINEX_API_URL}/spark/holders?tokenIdentifier=${tokenIdentifier}&limit=100`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        }
      );
      results.holders = holdersRes.data?.data || [];
    } catch (error) {
      console.error(`Could not fetch holders:`, error.message);
    }
  }

  return results;
}

// Format price with appropriate precision
function formatPrice(priceStr) {
  if (!priceStr) return 'N/A';
  const price = Number(priceStr);
  if (price < 0.0001) {
    return price.toExponential(4);
  }
  return price.toLocaleString(undefined, { maximumFractionDigits: 8, minimumFractionDigits: 0 });
}

// Format percentage change
function formatPercentChange(changePercent) {
  if (changePercent === null || changePercent === undefined) return 'N/A';
  const percent = Number(changePercent);
  const emoji = percent >= 0 ? '🟢' : '🔴';
  return `${emoji} ${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

// Create price embed for Discord
function createPriceEmbed(token, detailsData = null) {
  const embed = new EmbedBuilder()
    .setTitle(`${token.ticker || token.symbol || token.name} Price Info`)
    .setColor(0x00AE86) // Luminex green-ish color
    .setTimestamp(new Date());

  if (token.icon_url) {
    embed.setThumbnail(token.icon_url);
  }

  // Current price information
  const fields = [
    { name: 'Price (USD)', value: token.price_usd ? formatPrice(token.price_usd) : 'N/A', inline: true },
    { name: '24h Volume', value: token.agg_volume_24h_usd ? `$${Number(token.agg_volume_24h_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'N/A', inline: true },
    { name: 'Liquidity', value: token.agg_liquidity_usd ? `$${Number(token.agg_liquidity_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'N/A', inline: true },
  ];

  // Price changes across timeframes (from price-changes endpoint)
  if (detailsData?.priceChanges) {
    const pc = detailsData.priceChanges;
    
    // Add timeframe changes
    const timeframeFields = [];
    
    if (pc['5m']) {
      timeframeFields.push({
        name: '5m',
        value: formatPercentChange(pc['5m'].changePercent),
        inline: true,
      });
    }
    
    if (pc['15m']) {
      timeframeFields.push({
        name: '15m',
        value: formatPercentChange(pc['15m'].changePercent),
        inline: true,
      });
    }
    
    if (pc['1h']) {
      timeframeFields.push({
        name: '1h',
        value: formatPercentChange(pc['1h'].changePercent),
        inline: true,
      });
    }
    
    if (pc['6h']) {
      timeframeFields.push({
        name: '6h',
        value: formatPercentChange(pc['6h'].changePercent),
        inline: true,
      });
    }
    
    if (pc['24h']) {
      timeframeFields.push({
        name: '24h',
        value: formatPercentChange(pc['24h'].changePercent),
        inline: true,
      });
    }
    
    if (timeframeFields.length > 0) {
      fields.push({ name: '\u200b', value: '\u200b', inline: false }); // Spacer
      fields.push({ name: '📊 Price Changes', value: '\u200b', inline: false });
      fields.push(...timeframeFields);
      
      // Add last trade timestamp if available
      if (pc.lastTradeTimestamp) {
        const lastTrade = new Date(pc.lastTradeTimestamp);
        fields.push({
          name: 'Last Trade',
          value: `<t:${Math.floor(lastTrade.getTime() / 1000)}:R>`, // Relative time in Discord
          inline: false,
        });
      }
    }
  } else if (token.agg_price_change_24h_pct !== null && token.agg_price_change_24h_pct !== undefined) {
    // Fallback to database 24h change if price-changes endpoint not available
    const change = Number(token.agg_price_change_24h_pct) * 100;
    fields.push({ 
      name: '24h Change', 
      value: formatPercentChange(change), 
      inline: true 
    });
  }

  // Token details
  if (token.holder_count) {
    fields.push({ name: 'Holders', value: token.holder_count.toLocaleString(), inline: true });
  }

  if (token.total_supply) {
    fields.push({ name: 'Total Supply', value: token.total_supply.toLocaleString(), inline: true });
  }

  embed.addFields(fields);

  // Add pool pubkey for reference
  if (token.pool_lp_pubkey) {
    embed.setFooter({ text: `Pool: ${token.pool_lp_pubkey.substring(0, 20)}...` });
  }

  // Add recent swaps/activity if available
  if (detailsData?.swaps && detailsData.swaps.length > 0) {
    const recentSwaps = detailsData.swaps.slice(0, 5); // Show last 5 swaps
    let buyCount = 0;
    let sellCount = 0;
    let totalVolumeUsd = 0;

    const swapLines = recentSwaps.map(swap => {
      const isBuy = swap.swap_type === 'buy';
      if (isBuy) buyCount++;
      else sellCount++;

      // Calculate approximate USD volume (using asset_b which is usually BTC)
      const assetBAmount = Number(swap.asset_b_amount || 0);
      // Rough estimate if BTC price is known, otherwise just show amount
      const volumeEstimate = assetBAmount; // Could multiply by BTC price if available
      totalVolumeUsd += volumeEstimate;

      const emoji = isBuy ? '🟢' : '🔴';
      const swapTime = new Date(swap.swap_timestamp);
      const timeAgo = Math.floor((Date.now() - swapTime.getTime()) / 1000);
      const timeStr = timeAgo < 60 ? `${timeAgo}s` : timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m` : `${Math.floor(timeAgo / 3600)}h`;

      return `${emoji} ${isBuy ? 'BUY' : 'SELL'} ${formatPrice(swap.exec_price_a_in_b)} (${timeStr} ago)`;
    });

    const activityText = swapLines.join('\n');
    const summary = `**${buyCount} buys | ${sellCount} sells** in last ${recentSwaps.length} swaps`;

    embed.addFields({
      name: '📈 Recent Activity',
      value: `${summary}\n${activityText}`,
      inline: false,
    });
  }

  // Add comments preview if available
  if (detailsData?.comments && detailsData.comments.length > 0) {
    const topComment = detailsData.comments[0];
    embed.addFields({
      name: '💬 Latest Comment',
      value: `**${topComment.user_profile?.username || 'Anonymous'}**: ${topComment.content.substring(0, 200)}${topComment.content.length > 200 ? '...' : ''}`,
      inline: false,
    });
  }

  return embed;
}

// Create holders embed
function createHoldersEmbed(token, holders, limit = 10) {
  if (!holders || holders.length === 0) {
    return new EmbedBuilder()
      .setTitle(`📊 Holders: ${token.ticker || token.name}`)
      .setDescription('No holder data available')
      .setColor(0xffa500);
  }

  // Filter out pools and sort by balance
  const nonPoolHolders = holders
    .filter(h => !h.is_pool)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, limit);

  const poolHolders = holders.filter(h => h.is_pool);

  const embed = new EmbedBuilder()
    .setTitle(`📊 Top Holders: ${token.ticker || token.name}`)
    .setColor(0x00ff00);

  if (token.icon_url) {
    embed.setThumbnail(token.icon_url);
  }

  const fields = [];

  // Calculate total supply from holders
  const totalSupply = holders.reduce((sum, h) => sum + Number(h.balance || 0), 0);

  // Top holders list
  if (nonPoolHolders.length > 0) {
    const holderLines = nonPoolHolders.map((holder, index) => {
      const balance = Number(holder.balance || 0);
      const percentage = totalSupply > 0 ? ((balance / totalSupply) * 100).toFixed(2) : '0.00';
      const address = holder.address || holder.pubkey || 'Unknown';
      const shortAddress = address.length > 20 ? `${address.substring(0, 10)}...${address.substring(address.length - 6)}` : address;
      
      return `${index + 1}. **${shortAddress}**\n   ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${percentage}%)`;
    });

    fields.push({
      name: `Top ${nonPoolHolders.length} Holders`,
      value: holderLines.join('\n\n'),
      inline: false,
    });
  }

  // Pool info
  if (poolHolders.length > 0) {
    const poolBalance = poolHolders.reduce((sum, h) => sum + Number(h.balance || 0), 0);
    const poolPercentage = totalSupply > 0 ? ((poolBalance / totalSupply) * 100).toFixed(2) : '0.00';
    fields.push({
      name: '💰 Liquidity Pool',
      value: `${poolBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${poolPercentage}%)`,
      inline: true,
    });
  }

  // Statistics
  fields.push({
    name: '📈 Statistics',
    value: `**Total Holders:** ${holders.length}\n**Total Supply:** ${totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    inline: true,
  });

  embed.addFields(fields);

  if (token.pool_lp_pubkey) {
    embed.setFooter({ text: `Pool: ${token.pool_lp_pubkey.substring(0, 20)}...` });
  }

  return embed;
}

// Create swaps embed
function createSwapsEmbed(token, swaps, limit = 10) {
  if (!swaps || swaps.length === 0) {
    return new EmbedBuilder()
      .setTitle(`🔄 Swaps: ${token.ticker || token.name}`)
      .setDescription('No recent swap activity')
      .setColor(0xffa500);
  }

  const displaySwaps = swaps.slice(0, limit);
  const buyCount = swaps.filter(s => s.swap_type === 'buy').length;
  const sellCount = swaps.filter(s => s.swap_type === 'sell').length;

  const embed = new EmbedBuilder()
    .setTitle(`🔄 Recent Swaps: ${token.ticker || token.name}`)
    .setDescription(`**${buyCount} buys | ${sellCount} sells** in last ${swaps.length} swaps`)
    .setColor(0x00ff00);

  if (token.icon_url) {
    embed.setThumbnail(token.icon_url);
  }

  const swapLines = displaySwaps.map((swap, index) => {
    const isBuy = swap.swap_type === 'buy';
    const emoji = isBuy ? '🟢' : '🔴';
    const swapTime = new Date(swap.swap_timestamp);
    const timeAgo = Math.floor((Date.now() - swapTime.getTime()) / 1000);
    const timeStr = timeAgo < 60 ? `${timeAgo}s` : timeAgo < 3600 ? `${Math.floor(timeAgo / 60)}m` : `${Math.floor(timeAgo / 3600)}h`;
    
    const assetAAmount = Number(swap.asset_a_amount || 0);
    const assetBAmount = Number(swap.asset_b_amount || 0);
    
    return `${index + 1}. ${emoji} **${isBuy ? 'BUY' : 'SELL'}**\n   Price: ${formatPrice(swap.exec_price_a_in_b)}\n   Amount: ${assetAAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens for ${assetBAmount.toFixed(8)} BTC\n   <t:${Math.floor(swapTime.getTime() / 1000)}:R>`;
  });

  embed.addFields({
    name: `Last ${displaySwaps.length} Swaps`,
    value: swapLines.join('\n\n'),
    inline: false,
  });

  if (token.pool_lp_pubkey) {
    embed.setFooter({ text: `Pool: ${token.pool_lp_pubkey.substring(0, 20)}...` });
  }

  return embed;
}

// Register slash commands
async function registerCommands(clientId) {
  if (!clientId) {
    console.error('Cannot register commands: CLIENT_ID not available');
    return;
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

  try {
    console.log('Registering slash commands...');
    
    // Register globally (takes up to 1 hour) or for specific guild
    let registeredCommands = [];
    if (process.env.DISCORD_GUILD_ID) {
      registeredCommands = await rest.put(
        Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID),
        { body: commands },
      );
      console.log('✓ Registered slash commands for guild');
      
      // Set channel permissions if DISCORD_CHANNEL_ID is specified
      if (ALLOWED_CHANNEL_ID) {
        console.log(`Setting command permissions to channel: ${ALLOWED_CHANNEL_ID}...`);
        try {
          // Set permissions for all registered commands
          for (const command of registeredCommands) {
            await rest.put(
              Routes.applicationCommandPermissions(clientId, process.env.DISCORD_GUILD_ID, command.id),
              {
                body: {
                  permissions: [
                    {
                      id: ALLOWED_CHANNEL_ID,
                      type: 0, // CHANNEL type
                      permission: true, // Allow in this channel
                    },
                  ],
                },
              }
            );
          }
          console.log('✓ Commands restricted to specified channel');
          console.log('  Note: Commands will only appear in that channel. Other channels will not see them.');
        } catch (permError) {
          console.error('⚠️  Could not set command permissions:', permError.message);
          console.error('  Commands will still work, but may appear in all channels.');
          console.error('  Make sure your bot has "Manage Server" permission.');
        }
      }
    } else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands },
      );
      console.log('✓ Registered slash commands globally (may take up to 1 hour to appear)');
      if (ALLOWED_CHANNEL_ID) {
        console.log('⚠️  Note: Channel restrictions require DISCORD_GUILD_ID for guild commands.');
        console.log('  Add DISCORD_GUILD_ID to .env to enable channel restrictions.');
      }
    }
  } catch (error) {
    console.error('Error registering commands:', error.message);
    if (error.code === 50001) {
      console.error('  → Missing ACCESS. Make sure your bot token is valid and has the "applications.commands" scope.');
    }
  }
}

// Handle /price command
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Check if commands are restricted to a specific channel
  if (ALLOWED_CHANNEL_ID && interaction.channelId !== ALLOWED_CHANNEL_ID) {
    await interaction.reply({
      content: `❌ This bot only works in <#${ALLOWED_CHANNEL_ID}>.`,
      ephemeral: true, // Only visible to the user who ran the command
    }).catch(() => {}); // Ignore errors if interaction already replied
    return;
  }

  if (interaction.commandName === 'price') {
    await interaction.deferReply();

    const tokenName = interaction.options.getString('token', true);
    
    try {
      // Search database for token
      const token = db.findTokenByName(tokenName);
      
      if (!token) {
        await interaction.editReply({
          content: `❌ Token "${tokenName}" not found in database. The database is updated every 5 minutes.\n\nTry searching by ticker, symbol, or name.`,
        });
        return;
      }

      // Fetch additional details using pool_lp_pubkey and token_identifier
      let detailsData = null;
      try {
        detailsData = await fetchTokenDetails(token.pool_lp_pubkey, token.token_identifier);
      } catch (err) {
        console.error(`Could not fetch token details for ${token.ticker}:`, err.message);
        // Continue without additional details
      }

      // Fetch chart data and generate chart image
      let chartAttachment = null;
      if (token.token_identifier) {
        try {
          const chartData = await fetchChartData(token.token_identifier, 15, 24); // 15min resolution, 24 hours
          const chartImage = await generateChartImage(
            chartData, 
            token.ticker || token.name,
            token.price_usd
          );
          
          chartAttachment = new AttachmentBuilder(chartImage, {
            name: `${token.ticker || token.name}_chart.png`,
            description: `Price chart for ${token.ticker || token.name}`,
          });
        } catch (err) {
          console.error(`Could not generate chart for ${token.ticker}:`, err.message);
          // Continue without chart
        }
      }

      // Create and send embed with optional chart
      const embed = createPriceEmbed(token, detailsData);
      const replyOptions = { embeds: [embed] };
      
      if (chartAttachment) {
        replyOptions.files = [chartAttachment];
        embed.setImage(`attachment://${chartAttachment.name}`);
      }
      
      await interaction.editReply(replyOptions);
    } catch (error) {
      console.error('Error handling /price command:', error);
      await interaction.editReply({
        content: `❌ Error fetching price for "${tokenName}": ${error.message}`,
      });
    }
  }

  if (interaction.commandName === 'holders') {
    await interaction.deferReply();

    const tokenName = interaction.options.getString('token', true);
    const limit = interaction.options.getInteger('limit') || 10;
    
    try {
      const token = db.findTokenByName(tokenName);
      
      if (!token) {
        await interaction.editReply({
          content: `❌ Token "${tokenName}" not found in database.`,
        });
        return;
      }

      let detailsData = null;
      try {
        detailsData = await fetchTokenDetails(token.pool_lp_pubkey, token.token_identifier);
      } catch (err) {
        console.error(`Could not fetch token details for ${token.ticker}:`, err.message);
      }

      const embed = createHoldersEmbed(token, detailsData?.holders || [], limit);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error handling /holders command:', error);
      await interaction.editReply({
        content: `❌ Error fetching holders for "${tokenName}": ${error.message}`,
      });
    }
  }

  if (interaction.commandName === 'swaps') {
    await interaction.deferReply();

    const tokenName = interaction.options.getString('token', true);
    const limit = interaction.options.getInteger('limit') || 10;
    
    try {
      const token = db.findTokenByName(tokenName);
      
      if (!token) {
        await interaction.editReply({
          content: `❌ Token "${tokenName}" not found in database.`,
        });
        return;
      }

      let detailsData = null;
      try {
        detailsData = await fetchTokenDetails(token.pool_lp_pubkey, token.token_identifier);
      } catch (err) {
        console.error(`Could not fetch token details for ${token.ticker}:`, err.message);
      }

      const embed = createSwapsEmbed(token, detailsData?.swaps || [], limit);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error handling /swaps command:', error);
      await interaction.editReply({
        content: `❌ Error fetching swaps for "${tokenName}": ${error.message}`,
      });
    }
  }

  if (interaction.commandName === 'chart') {
    await interaction.deferReply();

    const tokenName = interaction.options.getString('token', true);
    const timeframe = interaction.options.getString('timeframe') || '24h';
    
    try {
      const token = db.findTokenByName(tokenName);
      
      if (!token) {
        await interaction.editReply({
          content: `❌ Token "${tokenName}" not found in database.`,
        });
        return;
      }

      if (!token.token_identifier) {
        await interaction.editReply({
          content: `❌ Token identifier not available for "${tokenName}".`,
        });
        return;
      }

      // Parse timeframe
      let resolution, hours;
      switch (timeframe) {
        case '1h':
          resolution = 15;
          hours = 1;
          break;
        case '6h':
          resolution = 15;
          hours = 6;
          break;
        case '24h':
          resolution = 15;
          hours = 24;
          break;
        case '7d':
          resolution = 60;
          hours = 168; // 7 days
          break;
        default:
          resolution = 15;
          hours = 24;
      }

      try {
        const chartData = await fetchChartData(token.token_identifier, resolution, hours);
        const chartImage = await generateChartImage(
          chartData,
          token.ticker || token.name,
          token.price_usd
        );
        
        const chartAttachment = new AttachmentBuilder(chartImage, {
          name: `${token.ticker || token.name}_chart.png`,
          description: `Price chart for ${token.ticker || token.name}`,
        });

        const embed = new EmbedBuilder()
          .setTitle(`📈 Price Chart: ${token.ticker || token.name}`)
          .setDescription(`Timeframe: ${timeframe}`)
          .setColor(0x00ff00)
          .setImage(`attachment://${chartAttachment.name}`);

        if (token.icon_url) {
          embed.setThumbnail(token.icon_url);
        }

        await interaction.editReply({
          embeds: [embed],
          files: [chartAttachment],
        });
      } catch (err) {
        console.error(`Could not generate chart for ${token.ticker}:`, err.message);
        await interaction.editReply({
          content: `❌ Error generating chart: ${err.message}`,
        });
      }
    } catch (error) {
      console.error('Error handling /chart command:', error);
      await interaction.editReply({
        content: `❌ Error fetching chart for "${tokenName}": ${error.message}`,
      });
    }
  }

  if (interaction.commandName === 'info') {
    await interaction.deferReply();

    const tokenName = interaction.options.getString('token', true);
    
    try {
      const token = db.findTokenByName(tokenName);
      
      if (!token) {
        await interaction.editReply({
          content: `❌ Token "${tokenName}" not found in database.`,
        });
        return;
      }

      // Fetch all details
      let detailsData = null;
      try {
        detailsData = await fetchTokenDetails(token.pool_lp_pubkey, token.token_identifier);
      } catch (err) {
        console.error(`Could not fetch token details for ${token.ticker}:`, err.message);
      }

      // Create comprehensive info embed
      const embed = createPriceEmbed(token, detailsData);

      // Add holders info if available
      if (detailsData?.holders && detailsData.holders.length > 0) {
        const topHolders = detailsData.holders
          .filter(h => !h.is_pool)
          .sort((a, b) => Number(b.balance) - Number(a.balance))
          .slice(0, 5);
        
        if (topHolders.length > 0) {
          const holderLines = topHolders.map((h, i) => {
            const balance = Number(h.balance || 0);
            const address = h.address || h.pubkey || 'Unknown';
            const shortAddr = address.length > 20 ? `${address.substring(0, 10)}...` : address;
            return `${i + 1}. ${shortAddr}: ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
          });
          
          embed.addFields({
            name: '🏆 Top 5 Holders',
            value: holderLines.join('\n'),
            inline: false,
          });
        }
      }

      // Generate chart
      let chartAttachment = null;
      if (token.token_identifier) {
        try {
          const chartData = await fetchChartData(token.token_identifier, 15, 24);
          const chartImage = await generateChartImage(
            chartData,
            token.ticker || token.name,
            token.price_usd
          );
          
          chartAttachment = new AttachmentBuilder(chartImage, {
            name: `${token.ticker || token.name}_chart.png`,
          });

          embed.setImage(`attachment://${chartAttachment.name}`);
        } catch (err) {
          console.error(`Could not generate chart:`, err.message);
        }
      }

      const replyOptions = { embeds: [embed] };
      if (chartAttachment) {
        replyOptions.files = [chartAttachment];
      }

      await interaction.editReply(replyOptions);
    } catch (error) {
      console.error('Error handling /info command:', error);
      await interaction.editReply({
        content: `❌ Error fetching info for "${tokenName}": ${error.message}`,
      });
    }
  }

  if (interaction.commandName === 'tokens') {
    await interaction.deferReply();

    const limit = interaction.options.getInteger('limit') || 10;
    const offset = interaction.options.getInteger('offset') || 0;
    
    try {
      // Call the local API endpoint
      const apiUrl = process.env.API_URL || 'http://localhost:3000';
      const tokensUrl = `${apiUrl}/api/tokens`;
      
      // Fetch tokens from API
      const res = await axios.get(tokensUrl, {
        timeout: 15000,
        headers: {
          'Accept': 'application/json',
        },
      });

      const tokens = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : []);
      
      if (!tokens || tokens.length === 0) {
        await interaction.editReply({
          content: '❌ No tokens found in API response.',
        });
        return;
      }

      // Apply pagination
      const paginatedTokens = tokens.slice(offset, offset + limit);
      
      if (paginatedTokens.length === 0) {
        await interaction.editReply({
          content: `❌ No tokens found at offset ${offset}. Try a lower offset.`,
        });
        return;
      }

      // Create embed with token list
      const embed = new EmbedBuilder()
        .setTitle(`📊 Top Tokens by Volume (Real-time from API)`)
        .setDescription(`Showing ${paginatedTokens.length} of ${tokens.length} tokens`)
        .setColor(0x00AE86)
        .setTimestamp(new Date());

      // Format token list
      const tokenLines = paginatedTokens.map((token, index) => {
        const rank = offset + index + 1;
        const symbol = token.symbol || token.ticker || token.name || 'N/A';
        const price = token.price_usd || token.agg_price_usd || 0;
        const volume24h = token.agg_volume_24h_usd || 0;
        const liquidity = token.agg_liquidity_usd || 0;
        const change24h = token.agg_price_change_24h_pct || 0;
        
        const priceStr = price > 0 
          ? (price < 0.0001 ? price.toExponential(4) : `$${price.toLocaleString(undefined, { maximumFractionDigits: 8 })}`)
          : 'N/A';
        const volumeStr = volume24h > 0 
          ? `$${Number(volume24h).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : 'N/A';
        const changeStr = change24h !== 0 
          ? `${change24h >= 0 ? '🟢' : '🔴'} ${(change24h * 100).toFixed(2)}%`
          : 'N/A';
        
        return `${rank}. **${symbol}**\n   Price: ${priceStr} | Vol: ${volumeStr} | ${changeStr}`;
      });

      // Split into fields if needed (Discord has field limits)
      const maxFieldLength = 1024;
      let currentField = '';
      const fields = [];

      for (const line of tokenLines) {
        if (currentField.length + line.length + 2 > maxFieldLength) {
          fields.push({
            name: '\u200b',
            value: currentField.trim(),
            inline: false,
          });
          currentField = line + '\n';
        } else {
          currentField += line + '\n';
        }
      }

      if (currentField.trim()) {
        fields.push({
          name: '\u200b',
          value: currentField.trim(),
          inline: false,
        });
      }

      embed.addFields(fields);

      // Add footer with pagination info
      embed.setFooter({ 
        text: `Showing ${offset + 1}-${offset + paginatedTokens.length} of ${tokens.length} tokens | Use /tokens limit:50 offset:${offset + limit} for more` 
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error handling /tokens command:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      await interaction.editReply({
        content: `❌ Error fetching tokens from API: ${errorMsg}\n\nMake sure the Next.js API server is running on ${process.env.API_URL || 'http://localhost:3000'}`,
      });
    }
  }
});

// Bot ready handler
client.once('ready', async () => {
  console.log(`Discord bot ready! Logged in as ${client.user.tag}`);
  console.log(`Monitoring ${client.guilds.cache.size} guild(s)`);
  
  // Get client ID from bot user
  const clientId = client.user.id || getClientId();
  
  // Register slash commands
  await registerCommands(clientId);
  
  // Initial database update
  await updateTokenDatabase();
  
  // Set up cron job to update database every 5 minutes
  setInterval(updateTokenDatabase, POLL_INTERVAL_MS);
  
  console.log(`✓ Price bot is ready! Database will update every ${POLL_INTERVAL_MS / 60000} minutes.`);
  console.log(`  Use /price <token_name> in Discord to get token information.`);
});

// Start bot
client.login(DISCORD_TOKEN).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  client.destroy();
  process.exit(0);
});

