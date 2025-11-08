// Discord bot to monitor Luminex Bitcoin-based meme coin buys and send alerts
// NOTE: Buy/sell monitoring functionality has been disabled. Use price-bot.js for Discord commands.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// Disable buy monitoring - functionality removed
const BUY_MONITORING_ENABLED = false;

import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import WebSocket from 'ws';
import axios from 'axios';

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const BITCOIN_API_URL = process.env.BITCOIN_API_URL || 'https://blockstream.info/api';
const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_TOKEN || ''; // Optional: for better rate limits
const LUMINEX_API_URL = process.env.LUMINEX_API_URL || 'https://api.luminex.io/spark/tokens-with-pools';
const BUY_THRESHOLD = Number(process.env.BUY_THRESHOLD || 5); // buys per minute
const TIME_WINDOW_MS = 60000; // 1 minute
const BTC_USD_PRICE_API = 'https://api.coinbase.com/v2/exchange-rates?currency=BTC';

// Cache of Luminex Bitcoin-based tokens
const luminexTokens = new Map(); // address/ticker -> token info
let lastTokenUpdate = 0;
const TOKEN_CACHE_MS = 300000; // Update token list every 5 minutes
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5; // After 5 failures, reduce logging
let lastErrorLogTime = 0;
const ERROR_LOG_INTERVAL_MS = 300000; // Only log errors every 5 minutes if failing repeatedly

if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!DISCORD_CHANNEL_ID) {
  console.error('Error: DISCORD_CHANNEL_ID environment variable is required');
  process.exit(1);
}

// Track buys per Luminex token: { tokenTicker/address: [{ timestamp, txid, amount_btc, amount_usd }] }
const buyTracking = new Map();
const lastAlertTimes = new Map(); // Track last alert time per token
let btcUsdPrice = 0; // Current BTC/USD price

// Update BTC price every minute
async function updateBtcPrice() {
  try {
    const res = await axios.get(BTC_USD_PRICE_API);
    if (res.data && res.data.data && res.data.data.rates && res.data.data.rates.USD) {
      btcUsdPrice = parseFloat(res.data.data.rates.USD);
      console.log(`BTC/USD price updated: $${btcUsdPrice.toLocaleString()}`);
    }
  } catch (e) {
    console.error('Error fetching BTC price:', e.message);
    // Fallback price
    if (!btcUsdPrice) btcUsdPrice = 65000; // Default fallback
  }
}

// Fetch Luminex tokens and identify Bitcoin-based ones
async function updateLuminexTokens() {
  try {
    const now = Date.now();
    const shouldLog = consecutiveFailures < MAX_CONSECUTIVE_FAILURES || 
                     (now - lastErrorLogTime) > ERROR_LOG_INTERVAL_MS;
    
    if (shouldLog) {
      console.log('Fetching Luminex tokens...');
    }
    
    const res = await axios.get(
      `${LUMINEX_API_URL}?offset=0&limit=500&sort_by=agg_volume_24h_usd&order=desc`,
      { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      }
    );
    
    const data = res.data;
    const tokens = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    
    luminexTokens.clear();
    
    // Filter for Bitcoin-based tokens (check for Bitcoin addresses or BRC-20 indicators)
    for (const token of tokens) {
      const address = token.address || token.mint;
      const ticker = token.symbol;
      
      // Check if it's a Bitcoin-based token
      // Bitcoin addresses start with: 1, 3, bc1
      // Or check for BRC-20/inscription indicators
      if (address && (
        address.startsWith('1') || 
        address.startsWith('3') || 
        address.startsWith('bc1') ||
        address.startsWith('tb1') || // testnet
        token.network === 'bitcoin' ||
        token.chain === 'bitcoin' ||
        token.blockchain === 'bitcoin'
      )) {
        const key = ticker || address;
        luminexTokens.set(key, {
          ...token,
          address,
          ticker,
          isBitcoinBased: true
        });
      }
    }
    
    // Success - reset failure counter
    if (consecutiveFailures > 0) {
      console.log(`✓ Successfully fetched Luminex tokens after ${consecutiveFailures} failed attempts`);
    }
    consecutiveFailures = 0;
    console.log(`Loaded ${luminexTokens.size} Bitcoin-based Luminex tokens`);
    lastTokenUpdate = Date.now();
  } catch (e) {
    consecutiveFailures++;
    const now = Date.now();
    const shouldLog = consecutiveFailures < MAX_CONSECUTIVE_FAILURES || 
                     (now - lastErrorLogTime) > ERROR_LOG_INTERVAL_MS;
    
    if (shouldLog) {
      if (e.response?.status === 403) {
        console.error(`Error fetching Luminex tokens: Request blocked by Cloudflare (403)`);
        if (consecutiveFailures === 1) {
          console.error('  → Bot will continue monitoring Bitcoin transactions, but cannot identify Luminex tokens automatically.');
          console.error('  → You can manually record buys via POST /api/buys/record endpoint.');
        }
      } else {
        console.error('Error fetching Luminex tokens:', e.message);
      }
      lastErrorLogTime = now;
    } else if (consecutiveFailures === MAX_CONSECUTIVE_FAILURES) {
      console.error(`⚠ Luminex API still blocked. Suppressing repeated error logs. Will retry in ${ERROR_LOG_INTERVAL_MS / 60000} minutes.`);
      lastErrorLogTime = now;
    }
    
    // Continue operation even if token fetch fails
    if (luminexTokens.size === 0 && consecutiveFailures > 0) {
      // If we have no tokens and keep failing, log a summary periodically
      if (consecutiveFailures % 10 === 0) {
        console.log(`Bot still running. Monitoring Bitcoin transactions (${luminexTokens.size} known Luminex tokens).`);
      }
    }
  }
}

// Initialize Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', () => {
  console.log(`Discord bot ready! Logged in as ${client.user.tag}`);
  if (BUY_MONITORING_ENABLED) {
    console.log(`Monitoring for tokens with >${BUY_THRESHOLD} buys in ${TIME_WINDOW_MS / 1000}s`);
    startMonitoring();
  } else {
    console.log('⚠️  Buy monitoring is disabled. Use price-bot.js for Discord commands.');
    console.log('   This bot is kept for reference only. Buy/sell functionality has been removed.');
  }
});

async function startMonitoring() {
  // Update BTC price first
  await updateBtcPrice();
  setInterval(updateBtcPrice, 60000); // Update every minute

  // Load Luminex tokens
  await updateLuminexTokens();
  // Update token list periodically
  setInterval(() => {
    if (Date.now() - lastTokenUpdate > TOKEN_CACHE_MS) {
      updateLuminexTokens();
    }
  }, 60000);

  console.log('Starting Bitcoin transaction monitoring for Luminex tokens...');
  console.log(`Monitoring ${luminexTokens.size} Bitcoin-based Luminex tokens`);
  
  // Get all Bitcoin addresses we should monitor
  const addressesToMonitor = new Set();
  for (const [key, token] of luminexTokens.entries()) {
    if (token.address) {
      addressesToMonitor.add(token.address);
      // Also add pool address if it's a Bitcoin address
      if (token.pool_address && (
        token.pool_address.startsWith('1') || 
        token.pool_address.startsWith('3') || 
        token.pool_address.startsWith('bc1')
      )) {
        addressesToMonitor.add(token.pool_address);
      }
    }
  }
  
  console.log(`Monitoring ${addressesToMonitor.size} Bitcoin addresses for Luminex tokens`);
  
  // Connect to BlockCypher WebSocket for real-time Bitcoin transactions
  const wsUrl = BLOCKCYPHER_TOKEN 
    ? `wss://socket.blockcypher.com/v1/btc/main?token=${BLOCKCYPHER_TOKEN}`
    : 'wss://socket.blockcypher.com/v1/btc/main';
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('Connected to BlockCypher Bitcoin WebSocket');
    // Subscribe to unconfirmed transactions
    ws.send(JSON.stringify({ event: 'unconfirmed-tx' }));
    ws.send(JSON.stringify({ event: 'new-block' }));
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.event === 'unconfirmed-tx' && message.hash) {
        processBitcoinTransaction(message, addressesToMonitor);
      } else if (message.event === 'new-block' && message.hash) {
        // Get confirmed transactions from new block
        fetchBlockTransactions(message.hash, addressesToMonitor);
      }
    } catch (e) {
      console.error('Error processing WebSocket message:', e.message);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket closed, reconnecting in 5 seconds...');
    setTimeout(() => startMonitoring(), 5000);
  });

  // Also check thresholds periodically
  setInterval(() => {
    checkBuyThresholds();
  }, 5000); // Check every 5 seconds

  // Clean up old entries
  setInterval(() => {
    cleanupOldBuys();
  }, 30000);
}

async function processBitcoinTransaction(tx, addressesToMonitor) {
  try {
    // Get transaction details from BlockCypher or Blockstream
    const txDetails = await fetchTransactionDetails(tx.hash);
    if (!txDetails) return;

    // Track transactions to Luminex token addresses only
    for (const output of txDetails.outputs || []) {
      if (output.addresses && output.addresses.length > 0) {
        const address = output.addresses[0];
        
        // Only process if this address is a Luminex token address
        if (addressesToMonitor.has(address)) {
          // Find which Luminex token this address belongs to
          let tokenInfo = null;
          let tokenKey = null;
          
          for (const [key, token] of luminexTokens.entries()) {
            if (token.address === address || token.pool_address === address) {
              tokenInfo = token;
              tokenKey = token.ticker || key;
              break;
            }
          }
          
          if (tokenInfo) {
            const amountBtc = output.value / 100000000; // Convert satoshi to BTC
            const amountUsd = amountBtc * btcUsdPrice;
            
            // Record buy for this specific Luminex token
            recordBuy(tokenKey, tx.hash, amountBtc, amountUsd, tokenInfo);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error processing Bitcoin transaction:', e.message);
  }
}

async function fetchTransactionDetails(txid) {
  try {
    // Try BlockCypher first (if token provided)
    if (BLOCKCYPHER_TOKEN) {
      const res = await axios.get(
        `https://api.blockcypher.com/v1/btc/main/txs/${txid}?token=${BLOCKCYPHER_TOKEN}`,
        { timeout: 5000 }
      );
      return res.data;
    }
    
    // Fallback to Blockstream
    const res = await axios.get(
      `${BITCOIN_API_URL}/tx/${txid}`,
      { timeout: 5000 }
    );
    return res.data;
  } catch (e) {
    console.error(`Error fetching tx ${txid}:`, e.message);
    return null;
  }
}

async function fetchBlockTransactions(blockHash, addressesToMonitor) {
  try {
    // Fetch block transactions
    const res = await axios.get(
      `${BITCOIN_API_URL}/block/${blockHash}/txids`,
      { timeout: 10000 }
    );
    
    // Process first 10 transactions (to avoid rate limits)
    const txids = res.data.slice(0, 10);
    for (const txid of txids) {
      const txDetails = await fetchTransactionDetails(txid);
      if (txDetails) {
        processBitcoinTransaction({ hash: txid, ...txDetails }, addressesToMonitor);
      }
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (e) {
    console.error('Error fetching block transactions:', e.message);
  }
}

function recordBuy(tokenKey, txid, amountBtc, amountUsd, tokenInfo = null) {
  const now = Date.now();
  if (!buyTracking.has(tokenKey)) {
    buyTracking.set(tokenKey, []);
  }
  
  const buys = buyTracking.get(tokenKey);
  buys.push({ 
    timestamp: now, 
    txid, 
    amount_btc: amountBtc,
    amount_usd: amountUsd,
    tokenInfo
  });
  
  // Clean old buys from this token
  const recentBuys = buys.filter(b => now - b.timestamp < TIME_WINDOW_MS * 2);
  buyTracking.set(tokenKey, recentBuys);
  
  const countInWindow = recentBuys.filter(b => now - b.timestamp < TIME_WINDOW_MS).length;
  const totalUsd = recentBuys
    .filter(b => now - b.timestamp < TIME_WINDOW_MS)
    .reduce((sum, b) => sum + (b.amount_usd || 0), 0);
  
  const tokenName = tokenInfo?.symbol || tokenKey;
  console.log(`Recorded buy for Luminex token ${tokenName} (${countInWindow}/${BUY_THRESHOLD} buys, $${totalUsd.toFixed(2)} USD in window)`);
  
  // Check if threshold exceeded
  if (countInWindow >= BUY_THRESHOLD) {
    const lastAlert = lastAlertTimes.get(tokenKey);
    if (!lastAlert || now - lastAlert > TIME_WINDOW_MS) {
      sendDiscordAlert(tokenKey, countInWindow, recentBuys);
      lastAlertTimes.set(tokenKey, now);
    }
  }
}

function checkBuyThresholds() {
  const now = Date.now();
  for (const [tokenKey, buys] of buyTracking.entries()) {
    if (tokenKey.endsWith('_last_alert')) continue;
    
    const recentBuys = buys.filter(b => now - b.timestamp < TIME_WINDOW_MS);
    if (recentBuys.length >= BUY_THRESHOLD) {
      // Check if we already alerted for this token recently
      const lastAlert = lastAlertTimes.get(tokenKey);
      if (!lastAlert || now - lastAlert > TIME_WINDOW_MS) {
        sendDiscordAlert(tokenKey, recentBuys.length, buys);
        lastAlertTimes.set(tokenKey, now);
      }
      // Otherwise skip to avoid spam
    }
  }
}

function cleanupOldBuys() {
  const now = Date.now();
  for (const [tokenKey, buys] of buyTracking.entries()) {
    if (tokenKey.endsWith('_last_alert')) continue;
    const recentBuys = buys.filter(b => now - b.timestamp < TIME_WINDOW_MS * 2);
    buyTracking.set(tokenKey, recentBuys);
  }
}

async function sendDiscordAlert(tokenKey, buyCount, allBuys = []) {
  try {
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error(`Channel ${DISCORD_CHANNEL_ID} not found`);
      return;
    }

    // Get token info from most recent buy
    const tokenInfo = allBuys[allBuys.length - 1]?.tokenInfo || luminexTokens.get(tokenKey);
    
    // Calculate totals from recent buys
    const recentBuys = allBuys.filter(b => Date.now() - b.timestamp < TIME_WINDOW_MS);
    const totalBtc = recentBuys.reduce((sum, b) => sum + (b.amount_btc || 0), 0);
    const totalUsd = recentBuys.reduce((sum, b) => sum + (b.amount_usd || 0), 0);
    const avgBuyUsd = totalUsd / buyCount;

    const embed = new EmbedBuilder()
      .setTitle('🚨 High Buy Activity Detected!')
      .setDescription(`**${tokenInfo?.symbol || tokenKey}** has **${buyCount} buys** in the last minute!`)
      .addFields(
        { name: 'Token', value: tokenInfo?.symbol || tokenKey, inline: true },
        { name: 'Name', value: (tokenInfo?.name || 'Luminex Token').substring(0, 30), inline: true },
        { name: 'Buy Count', value: `${buyCount} buys`, inline: true },
        { name: 'Time Window', value: '1 minute', inline: true }
      )
      .setColor(0xf7931a) // Bitcoin orange color
      .setTimestamp();

    // Add USD amounts
    if (tokenInfo) {
      const price = Number(tokenInfo.price_usd || 0);
      const volume24h = Number(tokenInfo.agg_volume_24h_usd || 0);
      const liquidity = Number(tokenInfo.agg_liquidity_usd || 0);
      const priceChange24h = Number(tokenInfo.agg_price_change_24h_pct || 0);
      
      embed.addFields(
        { name: 'Price (USD)', value: price > 0 ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` : 'N/A', inline: true },
        { name: 'Volume 24h (USD)', value: volume24h > 0 ? `$${volume24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A', inline: true },
        { name: 'Liquidity (USD)', value: liquidity > 0 ? `$${liquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A', inline: true },
        { name: '24h Change', value: priceChange24h !== 0 ? `${(priceChange24h * 100).toFixed(2)}%` : 'N/A', inline: true }
      );
    }

    embed.addFields(
      { name: 'Total Buy Volume (BTC)', value: `${totalBtc.toFixed(8)} BTC`, inline: true },
      { name: 'Total Buy Volume (USD)', value: `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
      { name: 'Avg Buy Size (USD)', value: `$${avgBuyUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
      { name: 'BTC Price', value: `$${btcUsdPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true }
    );

    // Add transaction links (limit to recent ones)
    if (recentBuys.length > 0) {
      const txLinks = recentBuys.slice(0, 5).map((b, idx) => 
        `[Tx ${idx + 1}](https://blockstream.info/tx/${b.txid})`
      ).join(' • ');
      embed.addFields({ 
        name: 'Recent Transactions', 
        value: txLinks || 'N/A', 
        inline: false 
      });
    }

    // Add explorer links
    if (tokenInfo?.address) {
      embed.addFields({
        name: '🔗 Links',
        value: `[Blockstream](https://blockstream.info/address/${tokenInfo.address}) • [Token Address](https://blockstream.info/address/${tokenInfo.address})`,
        inline: false
      });
    }

    embed.setFooter({ 
      text: `Luminex Bitcoin Token • Updated: ${new Date().toLocaleTimeString()}` 
    });

    const tokenSymbol = tokenInfo?.symbol || tokenKey;
    await channel.send({ 
      content: `@here 🚨 **${buyCount} BUYS IN 1 MINUTE for ${tokenSymbol}!**\n💰 Total Volume: **$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**`, 
      embeds: [embed] 
    });
    
    console.log(`Sent Discord alert for ${tokenSymbol}: ${buyCount} buys, $${totalUsd.toFixed(2)} USD`);
  } catch (error) {
    console.error('Error sending Discord alert:', error);
  }
}

// For testing - you can manually add buys via API
export function addTestBuy(tokenKey, txid = 'test_' + Date.now(), amountBtc = 0.001, amountUsd = null) {
  if (amountUsd === null) amountUsd = amountBtc * btcUsdPrice;
  const tokenInfo = luminexTokens.get(tokenKey);
  recordBuy(tokenKey, txid, amountBtc, amountUsd, tokenInfo);
}

// Start the bot
client.login(DISCORD_TOKEN).catch(console.error);

// Export for use in API routes
export { recordBuy, client };

