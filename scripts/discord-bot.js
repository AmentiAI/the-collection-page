const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  REST,
  Routes,
  ApplicationCommandOptionType,
  EmbedBuilder,
  AttachmentBuilder,
} = require('discord.js');
const fetch = require('node-fetch');
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
const HOLDERS_CHANNEL_ID = process.env.HOLDERS_CHANNEL_ID;
const HOLDER_ROLE_ID = process.env.HOLDER_ROLE_ID;
const BOT_STATUS_CHANNEL_ID = process.env.BOT_STATUS_CHANNEL_ID;
const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL;
const DUALITY_TRIAL_CHANNEL_ID = process.env.DUALITY_TRIAL_CHANNEL_ID;
const DUALITY_EVENTS_CHANNEL_ID = process.env.DUALITY_EVENTS_CHANNEL_ID;
const DUALITY_PARTICIPANT_ROLE_ID = process.env.DUALITY_PARTICIPANT_ROLE_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const DUALITY_BASE_URL =
  process.env.DUALITY_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const LUMINEX_API_URL = process.env.LUMINEX_API_URL || 'https://api.luminex.io/spark';
const LUMINEX_CHART_API_URL = process.env.LUMINEX_CHART_API_URL || 'https://api.luminex.io';
const parsedLuminexInterval = Number(process.env.LUMINEX_POLL_INTERVAL_MS || 5 * 60 * 1000);
const LUMINEX_POLL_INTERVAL_MS = Number.isFinite(parsedLuminexInterval)
  ? Math.max(60_000, parsedLuminexInterval)
  : 5 * 60 * 1000;
const LUMINEX_ALLOWED_CHANNEL_ID =
  process.env.LUMINEX_CHANNEL_ID ||
  process.env.LUMINEX_ALLOWED_CHANNEL_ID ||
  process.env.DISCORD_LUMINEX_CHANNEL_ID ||
  null;
const LUMINEX_COMMANDS_ENABLED = process.env.ENABLE_LUMINEX_COMMANDS !== 'false';
const parsedLuminexPageSize = Number(process.env.LUMINEX_FETCH_PAGE_SIZE || 100);
const LUMINEX_PAGE_SIZE = Number.isFinite(parsedLuminexPageSize) && parsedLuminexPageSize > 0
  ? Math.min(Math.max(parsedLuminexPageSize, 25), 250)
  : 100;
const QUICKCHART_ENDPOINT = process.env.QUICKCHART_ENDPOINT || 'https://quickchart.io/chart';
const LUMINEX_USER_AGENT =
  process.env.LUMINEX_USER_AGENT || 'TheDamnedBot/1.0 (+https://thedamned.xyz)';
const LUMINEX_COMMAND_NAMES = new Set(['price', 'holders', 'swaps', 'chart', 'info', 'tokens']);
const DEFAULT_TOKEN_LIST_LIMIT = Number.isFinite(Number(process.env.LUMINEX_TOKENS_LIMIT))
  ? Math.max(1, Math.min(50, Number(process.env.LUMINEX_TOKENS_LIMIT)))
  : 10;
let luminexSyncInProgress = false;
let luminexLastSync = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_EVENT_TYPES = ['Blessing', 'Temptation', 'Fate Roll'];
const trialMessageCache = new Map();
const PAIRING_WINDOW_MINUTES = Number(process.env.DUALITY_PAIRING_WINDOW_MINUTES || 60);
const PAIRING_COOLDOWN_MINUTES = Number(process.env.DUALITY_PAIRING_COOLDOWN_MINUTES || 60);

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

const priceCommand = {
  name: 'price',
  description: 'Get price information for a Luminex token',
  options: [
    {
      name: 'token',
      type: ApplicationCommandOptionType.String,
      description: 'Token name, ticker, or symbol',
      required: true,
    },
  ],
};

const holdersCommand = {
  name: 'holders',
  description: 'View top holders for a Luminex token',
  options: [
    {
      name: 'token',
      type: ApplicationCommandOptionType.String,
      description: 'Token name, ticker, or symbol',
      required: true,
    },
    {
      name: 'limit',
      type: ApplicationCommandOptionType.Integer,
      description: 'Number of holders to display (default 10, max 25)',
      required: false,
      min_value: 1,
      max_value: 25,
    },
  ],
};

const swapsCommand = {
  name: 'swaps',
  description: 'View recent swap activity for a Luminex token',
  options: [
    {
      name: 'token',
      type: ApplicationCommandOptionType.String,
      description: 'Token name, ticker, or symbol',
      required: true,
    },
    {
      name: 'limit',
      type: ApplicationCommandOptionType.Integer,
      description: 'Number of swaps to show (default 10, max 25)',
      required: false,
      min_value: 1,
      max_value: 25,
    },
  ],
};

const chartCommand = {
  name: 'chart',
  description: 'Generate a price chart for a Luminex token',
  options: [
    {
      name: 'token',
      type: ApplicationCommandOptionType.String,
      description: 'Token name, ticker, or symbol',
      required: true,
    },
    {
      name: 'timeframe',
      type: ApplicationCommandOptionType.String,
      description: 'Chart timeframe',
      required: false,
      choices: [
        { name: '1 Hour (5m candles)', value: '1h' },
        { name: '6 Hours (15m candles)', value: '6h' },
        { name: '24 Hours (15m candles)', value: '24h' },
        { name: '7 Days (1h candles)', value: '7d' },
      ],
    },
  ],
};

const infoCommand = {
  name: 'info',
  description: 'Show a comprehensive summary for a Luminex token',
  options: [
    {
      name: 'token',
      type: ApplicationCommandOptionType.String,
      description: 'Token name, ticker, or symbol',
      required: true,
    },
  ],
};

const tokensCommand = {
  name: 'tokens',
  description: 'List top Luminex tokens from the shared database',
  options: [
    {
      name: 'limit',
      type: ApplicationCommandOptionType.Integer,
      description: 'Number of tokens to show (default 10, max 50)',
      required: false,
      min_value: 1,
      max_value: 50,
    },
    {
      name: 'offset',
      type: ApplicationCommandOptionType.Integer,
      description: 'Offset for pagination (default 0)',
      required: false,
      min_value: 0,
    },
  ],
};

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function apiFetch(endpoint, options = {}) {
  const url = `${DUALITY_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (ADMIN_TOKEN) {
    headers['x-admin-token'] = ADMIN_TOKEN;
  }

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }
  return { ok: response.ok, status: response.status, data: json };
}

async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    const commands = [verifyCommand, checkHoldersCommand, checkinCommand];
    if (LUMINEX_COMMANDS_ENABLED) {
      commands.push(
        priceCommand,
        holdersCommand,
        swapsCommand,
        chartCommand,
        infoCommand,
        tokensCommand
      );
    }

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

async function fetchDualityStatus() {
  try {
    const res = await apiFetch('/api/duality/cycle');
    if (!res.ok) {
      console.error('[Duality] Failed to fetch cycle status:', res.status, res.data);
      return null;
    }
    return res.data;
  } catch (error) {
    console.error('[Duality] Error fetching cycle status:', error);
    return null;
  }
}

async function handleDualityWeeklyCycle(client) {
  let status = await fetchDualityStatus();
  if (!status || !status.cycle) {
    console.log('[Duality] No active cycle detected.');
    return;
  }

  const updated = await managePairingSessions(status, client);
  if (updated) {
    status = (await fetchDualityStatus()) || status;
  }

  const cycle = status.cycle;
  if (cycle.status === 'trial') {
    await processTrials(status, client);
  } else if (cycle.status === 'active') {
    await processDailyEvents(status, client);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const direct = new Date(value);
    if (!Number.isNaN(direct.getTime())) return direct;
    const isoGuess = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(isoGuess.getTime()) ? null : isoGuess;
  }
  return null;
}

function getCycleDay(weekStart, fallbackDate) {
  const startDate = normalizeDate(weekStart) || normalizeDate(fallbackDate);
  if (!startDate) return null;
  const diff = Math.floor((Date.now() - startDate.getTime()) / DAY_MS);
  const day = diff + 1; // Day 1 == alignment day
  return day < 1 ? 1 : day;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function chooseRandom(arr) {
  if (!arr.length) return null;
  const index = Math.floor(Math.random() * arr.length);
  return arr[index];
}

function formatKarmaDelta(good, evil) {
  const fmt = (label, value) =>
    `${label}: ${value > 0 ? '+' : ''}${value}`;
  return [fmt('Good', good), fmt('Evil', evil)].join('  |  ');
}

function generateDailyEventOutcome(pair, good, evil, cycleDay) {
  const eventType = chooseRandom(DAILY_EVENT_TYPES);
  if (!eventType) return null;

  const mentions = [];
  if (good.discordUserId) mentions.push(`<@${good.discordUserId}>`);
  if (evil.discordUserId) mentions.push(`<@${evil.discordUserId}>`);

  const currentFate = typeof pair.fateMeter === 'number' ? pair.fateMeter : 50;

  let embedTitle = '';
  let description = '';
  let resultText = '';
  let karmaDeltaGood = 0;
  let karmaDeltaEvil = 0;
  let fateMeter = null;
  let metadata = {};
  let embedColor = 0x3498db;
  let globalEffect = null;
  let adminNote;

  switch (eventType) {
    case 'Blessing': {
      embedTitle = `🕊️ Blessing — Day ${cycleDay}`;
      description = 'Sacred verses echo between the pair, urging cooperation.';
      resultText = 'Blessing complete: the good side gains +10 karma.';
      karmaDeltaGood = 10;
      fateMeter = clamp(currentFate + 8, 0, 100);
      embedColor = 0x2ecc71;
      break;
    }
    case 'Temptation': {
      const success = Math.random() < 0.5;
      metadata = { success };
      embedTitle = `😈 Temptation — Day ${cycleDay}`;
      if (success) {
        description = 'The evil holder whispers forbidden deals into the ether.';
        resultText = 'Temptation succeeds: Evil gains +15 karma, Good loses 5.';
        karmaDeltaEvil = 15;
        karmaDeltaGood = -5;
        fateMeter = clamp(currentFate - 12, 0, 100);
        embedColor = 0xe74c3c;
      } else {
        description = 'The scheme collapses and virtue rebounds.';
        resultText = 'Temptation backfires: Good gains +5 karma, Evil loses 10.';
        karmaDeltaGood = 5;
        karmaDeltaEvil = -10;
        fateMeter = clamp(currentFate + 8, 0, 100);
        embedColor = 0x9b59b6;
      }
      break;
    }
    case 'Fate Roll': {
      const roll = Math.floor(Math.random() * 100) + 1;
      metadata = { roll };
      embedTitle = `🎲 Fate Roll — Day ${cycleDay}`;
      description = 'The Wheel of Duality spins for both holders.';
      embedColor = 0x2980b9;

      if (roll <= 10) {
        resultText = `Fate roll: ${roll}. Dark Surge! Evil deeds earn double karma for 12 hours.`;
        globalEffect = { effect: 'Dark Surge – Evil karma x2 (12h)', durationHours: 12 };
      } else if (roll <= 20) {
        resultText = `Fate roll: ${roll}. Mercy Hour! Good deeds earn double karma for 12 hours.`;
        globalEffect = { effect: 'Mercy Hour – Good karma x2 (12h)', durationHours: 12 };
      } else if (roll <= 80) {
        resultText = `Fate roll: ${roll}. Equilibrium holds — no global effect.`;
        globalEffect = { effect: null, durationHours: 0 };
      } else if (roll <= 90) {
        resultText = `Fate roll: ${roll}. Mischief Winds blow! Encourage holders to roleplay swapped morals for 6 hours.`;
        globalEffect = { effect: 'Mischief Winds – Temporary side swap', durationHours: 6 };
      } else {
        resultText = `Fate roll: ${roll}. Karmic Eclipse! Moderators should consider reshuffling pairings.`;
        globalEffect = { effect: 'Karmic Eclipse – Pairings reshuffled', durationHours: 0 };
        adminNote = '⚠️ Karmic Eclipse rolled — consider reshuffling Duality pairings manually.';
      }
      break;
    }
    default:
      return null;
  }

  const payload = {
    pairId: pair.id,
    cycleDay,
    eventType,
    result: resultText,
    karmaDeltaGood,
    karmaDeltaEvil,
    metadata,
  };

  if (eventType === 'Temptation' && evil?.id) {
    payload.participantId = evil.id;
  }

  if (fateMeter !== null) {
    payload.fateMeter = fateMeter;
  }

  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setDescription(`${description}\n\n${resultText}`)
    .setColor(embedColor)
    .addFields(
      { name: 'Good Holder', value: formatParticipant(good), inline: true },
      { name: 'Evil Holder', value: formatParticipant(evil), inline: true }
    )
    .setFooter({ text: `Cycle Day ${cycleDay}` })
    .setTimestamp(new Date());

  if (karmaDeltaGood !== 0 || karmaDeltaEvil !== 0) {
    embed.addFields({ name: 'Karma Shift', value: formatKarmaDelta(karmaDeltaGood, karmaDeltaEvil), inline: false });
  }

  if (globalEffect && globalEffect.effect) {
    embed.addFields({ name: 'Global Effect', value: globalEffect.effect, inline: false });
  }

  return {
    payload,
    embed,
    mentions,
    globalEffect,
    adminNote,
  };
}

async function startTrialVoting(trial, channel, client, metadata = {}) {
  const memberTag = trial.username || trial.walletAddress || trial.id.slice(0, 6);
  const mention = trial.discordUserId ? `<@${trial.discordUserId}>` : memberTag;

  const embed = new EmbedBuilder()
    .setTitle('⚖️ Trial of Karma')
    .setDescription(
      `${mention} has invoked the Jury of Peers.
React with ⚪️ to absolve or 🔴 to condemn.`
    )
    .addFields(
      { name: 'Status', value: 'Voting in progress', inline: true },
      { name: 'Alignment', value: trial.alignment, inline: true },
      {
        name: 'Vote Window',
        value: `Starts: ${new Date(trial.scheduledAt).toLocaleString()}
Ends: ${new Date(trial.voteEndsAt).toLocaleString()}`,
        inline: false,
      }
    )
    .setColor(0x8e44ad)
    .setTimestamp(new Date());

  try {
    const message = await channel.send({ content: mention, embeds: [embed] });
    await message.react('⚪️');
    await message.react('🔴');

    trialMessageCache.set(trial.id, { channelId: channel.id, messageId: message.id });

    const updatedMetadata = {
      ...metadata,
      discord_message_id: message.id,
      discord_channel_id: channel.id,
    };

    const res = await apiFetch('/api/duality/trials', {
      method: 'PATCH',
      body: JSON.stringify({
        trialId: trial.id,
        status: 'voting',
        metadata: updatedMetadata,
      }),
    });

    if (!res.ok) {
      console.error('[Duality] Failed to update trial status to voting:', res.status, res.data);
    }

    if (trial.discordUserId) {
      try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(trial.discordUserId);
        await member.send(
          `⚖️ **Trial of Karma**
Voting has begun for your trial.
Ends at: ${new Date(trial.voteEndsAt).toLocaleString()}
React in ${channel.toString()} with ⚪️ or 🔴 to rally support.`
        );
      } catch (dmError) {
        console.warn('[Duality] Unable to DM trial participant:', dmError.message);
      }
    }
  } catch (error) {
    console.error('[Duality] Failed to start trial voting:', error);
    await notifyAdmins(client, `⚠️ Failed to start trial voting for ${trial.id}: ${error.message}`);
  }
}

async function finalizeTrialVoting(trial, channel, client, metadata = {}) {
  const cache = trialMessageCache.get(trial.id) || metadata;
  let message;

  try {
    const targetChannel = cache.discord_channel_id
      ? await getChannel(client, cache.discord_channel_id)
      : channel;

    if (!targetChannel) {
      console.warn('[Duality] Cannot finalize trial — channel missing.');
      return;
    }

    if (cache.messageId || cache.discord_message_id) {
      message = await targetChannel.messages.fetch(cache.messageId || cache.discord_message_id);
    }
  } catch (error) {
    console.error('[Duality] Unable to fetch trial message:', error);
  }

  let votesAbsolve = 0;
  let votesCondemn = 0;

  if (message) {
    const reactions = message.reactions.cache;
    const absolveReaction = reactions.find((r) => r.emoji.name === '⚪️' || r.emoji.name === '⚪');
    const condemnReaction = reactions.find((r) => r.emoji.name === '🔴');

    if (absolveReaction) {
      votesAbsolve = Math.max(0, (absolveReaction.count || 0) - 1);
    }
    if (condemnReaction) {
      votesCondemn = Math.max(0, (condemnReaction.count || 0) - 1);
    }
  }

  const verdict = votesAbsolve >= votesCondemn ? 'absolve' : 'condemn';
  const verdictText = verdict === 'absolve' ? 'Majority absolved the holder.' : 'Majority condemned the holder.';

  const updatedMetadata = {
    ...(metadata || {}),
    discord_message_id: (cache.messageId || cache.discord_message_id || message?.id) ?? undefined,
    discord_channel_id: (cache.channelId || cache.discord_channel_id || channel.id) ?? undefined,
  };

  try {
    const res = await apiFetch('/api/duality/trials', {
      method: 'PATCH',
      body: JSON.stringify({
        trialId: trial.id,
        status: 'resolved',
        verdict,
        votesAbsolve,
        votesCondemn,
        metadata: updatedMetadata,
      }),
    });

    if (!res.ok) {
      console.error('[Duality] Failed to finalize trial:', res.status, res.data);
    }
  } catch (error) {
    console.error('[Duality] Trial finalize API error:', error);
  }

  try {
    await apiFetch(`/api/duality/trials/${trial.id}/votes`, {
      method: 'POST',
      body: JSON.stringify({
        counts: { votesAbsolve, votesCondemn },
        metadata: updatedMetadata,
      }),
    });
  } catch (error) {
    console.error('[Duality] Failed to persist vote counts:', error);
  }

  const summaryEmbed = new EmbedBuilder()
    .setTitle('⚖️ Trial Resolved')
    .setDescription(
      `${trial.username || trial.walletAddress || trial.id.slice(0, 6)} — ${verdict.toUpperCase()}
${verdictText}`
    )
    .addFields({ name: 'Votes', value: `⚪️ ${votesAbsolve}  |  🔴 ${votesCondemn}` })
    .setColor(verdict === 'absolve' ? 0x2ecc71 : 0xe74c3c)
    .setTimestamp(new Date());

  try {
    await channel.send({ embeds: [summaryEmbed] });
  } catch (error) {
    console.error('[Duality] Failed to post trial summary:', error);
  }

  if (trial.discordUserId) {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const member = await guild.members.fetch(trial.discordUserId);
      await member.send(
        `⚖️ **Trial Resolved**
Verdict: ${verdict.toUpperCase()}
Votes — ⚪️ ${votesAbsolve} / 🔴 ${votesCondemn}`
      );
    } catch (dmError) {
      console.warn('[Duality] Unable to DM verdict to participant:', dmError.message);
    }
  }

  trialMessageCache.delete(trial.id);
}

async function managePairingSessions(status, client) {
  if (!status || !status.cycle) return false;
  const participants = ensureArray(status.participants);
  const pairs = ensureArray(status.pairs);
  let updated = false;
  const now = Date.now();

  for (const pair of pairs || []) {
    if (!pair || pair.status !== 'active' || !pair.windowEnd) continue;
    const windowEnd = new Date(pair.windowEnd).getTime();
    if (Number.isNaN(windowEnd) || windowEnd > now) continue;

    const cooldown = pair.cooldownMinutes || PAIRING_COOLDOWN_MINUTES;
    const res = await apiFetch(`/api/duality/pairings/${pair.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', cooldownMinutes: cooldown }),
    });

    if (!res.ok) {
      console.error('[Duality] Failed to complete expired pairing:', res.status, res.data);
    } else {
      console.log(`[Duality] Pairing ${pair.id} window expired. Released partners with ${cooldown}m cooldown.`);
      updated = true;
    }
  }

  const readyGood = participants.filter((p) =>
    p.alignment === 'good' && p.readyForPairing && !p.currentPairId && (!p.nextAvailableAt || new Date(p.nextAvailableAt).getTime() <= now)
  );
  const readyEvil = participants.filter((p) =>
    p.alignment === 'evil' && p.readyForPairing && !p.currentPairId && (!p.nextAvailableAt || new Date(p.nextAvailableAt).getTime() <= now)
  );

  if (readyGood.length && readyEvil.length) {
    const res = await apiFetch('/api/duality/pairings', {
      method: 'POST',
      body: JSON.stringify({ windowMinutes: PAIRING_WINDOW_MINUTES, cooldownMinutes: PAIRING_COOLDOWN_MINUTES }),
    });

    if (!res.ok) {
      console.error('[Duality] Automatic pairing attempt failed:', res.status, res.data);
      await notifyAdmins(client, `⚠️ Duality pairing failed: ${res.data?.error || 'Unknown error'}`);
    } else if (res.data?.pairs?.length) {
      console.log(`[Duality] Created ${res.data.pairs.length} pairing session(s).`);
      await announcePairings(res.data.pairs, participants, client);
      updated = true;
    }
  }

  return updated;
}

async function processDailyEvents(status, client) {
  if (!status || !status.cycle || status.cycle.status !== 'active') return;

  const cycleDay = getCycleDay(status.cycle.weekStart, status.cycle.createdAt);
  if (cycleDay === null) {
    console.log('[Duality] Unable to determine cycle day.');
    return;
  }

  // Focus daily events on days 2-5 (after alignment, before trials)
  if (cycleDay < 2 || cycleDay > 5) {
    return;
  }

  const channel = await getChannel(client, DUALITY_EVENTS_CHANNEL_ID || HOLDERS_CHANNEL_ID);
  if (!channel) {
    console.log('[Duality] Event channel unavailable.');
    return;
  }

  const pairs = ensureArray(status.pairs);
  if (!pairs.length) return;

  for (const pair of pairs) {
    if (!pair || pair.status !== 'active') continue;

    const outcome = DAILY_EVENT_TYPES[Math.floor(Math.random() * DAILY_EVENT_TYPES.length)];
    const embed = new EmbedBuilder()
      .setTitle('🎲 Duality Event Triggered')
      .setDescription(`${outcome} hits the fate meter!`)
      .addFields({ name: 'Pair', value: pair.id })
      .setColor(0x1abc9c)
      .setTimestamp(new Date());

    try {
      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('[Duality] Failed to post daily event:', error);
    }
  }
}

async function processTrials(status, client) {
  if (!status || !status.cycle) return;
  const trials = ensureArray(status.trials);
  if (!trials.length) return;

  const channel = await getChannel(client, DUALITY_TRIAL_CHANNEL_ID || HOLDERS_CHANNEL_ID);
  if (!channel) {
    console.log('[Duality] Trial channel unavailable.');
    return;
  }

  const now = Date.now();

  for (const trial of trials) {
    if (!trial || !trial.id) continue;
    const scheduledAt = new Date(trial.scheduledAt).getTime();
    const voteEndsAt = new Date(trial.voteEndsAt).getTime();
    const metadata = trial.metadata || {};

    if (
      trial.status === 'scheduled' &&
      !Number.isNaN(scheduledAt) &&
      scheduledAt <= now
    ) {
      await startTrialVoting(trial, channel, client, metadata);
    } else if (
      trial.status === 'voting' &&
      !Number.isNaN(voteEndsAt) &&
      voteEndsAt <= now
    ) {
      await finalizeTrialVoting(trial, channel, client, metadata);
    }
  }
}

async function announcePairings(pairs, participants, client) {
  if (!pairs || pairs.length === 0) return;
  const channel = await getChannel(client, DUALITY_EVENTS_CHANNEL_ID || HOLDERS_CHANNEL_ID);
  if (!channel) {
    console.log('[Duality] Cannot announce pairings—channel missing.');
    return;
  }

  const participantMap = new Map();
  for (const participant of participants || []) {
    participantMap.set(participant.id, participant);
  }

  for (const pair of pairs) {
    const good = participantMap.get(pair.goodParticipantId);
    const evil = participantMap.get(pair.evilParticipantId);
    if (!good || !evil) continue;

    const windowEnd = pair.windowEnd ? new Date(pair.windowEnd) : null;
    const windowEndText = windowEnd ? `<t:${Math.floor(windowEnd.getTime() / 1000)}:R>` : `${PAIRING_WINDOW_MINUTES} minutes`;
    const cooldownText = `${pair.cooldownMinutes ?? PAIRING_COOLDOWN_MINUTES} minutes`;

    const embed = new EmbedBuilder()
      .setTitle('🔗 New Duality Pairing Window')
      .setDescription('Opposing holders have been paired for the next challenge slot.')
      .addFields(
        {
          name: 'Good Holder',
          value: formatParticipant(good),
          inline: true,
        },
        {
          name: 'Evil Holder',
          value: formatParticipant(evil),
          inline: true,
        },
        {
          name: 'Window Ends',
          value: windowEndText,
          inline: true,
        },
        {
          name: 'Cooldown',
          value: cooldownText,
          inline: true,
        }
      )
      .addFields({ name: 'Shared Fate Meter', value: `${pair.fateMeter ?? 50}/100`, inline: false })
      .setColor(0x9b59b6)
      .setTimestamp(new Date());

    const mentions = [];
    if (good.discordUserId) mentions.push(`<@${good.discordUserId}>`);
    if (evil.discordUserId) mentions.push(`<@${evil.discordUserId}>`);

    try {
      if (mentions.length) {
        await channel.send({ content: `${mentions.join(' + ')} — your pairing window is LIVE!`, embeds: [embed] });
      } else {
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('[Duality] Failed to announce pairing:', error);
    }

    const dmMessage = `🔗 **Duality Pairing Active**\nYour window ends ${windowEndText}. Coordinate with your partner and complete your objectives, then you will enter a ${cooldownText} cooldown.`;
    await dmUser(client, good.discordUserId, dmMessage);
    await dmUser(client, evil.discordUserId, dmMessage);
  }
}

async function notifyAdmins(client, message) {
  if (ADMIN_WEBHOOK_URL) {
    try {
      await fetch(ADMIN_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      });
      return;
    } catch (error) {
      console.error('[Duality] Failed to notify admins via webhook:', error);
    }
  }

  const channel = await getChannel(client, BOT_STATUS_CHANNEL_ID);
  if (channel) {
    try {
      await channel.send(message);
    } catch (error) {
      console.error('[Duality] Failed to notify admins via channel:', error);
    }
  }
}

async function getChannel(client, channelId) {
  if (!channelId) return null;
  try {
    const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId));
    return channel;
  } catch (error) {
    console.error(`[Duality] Failed to fetch channel ${channelId}:`, error);
    return null;
  }
}

async function dmUser(client, discordUserId, content) {
  if (!discordUserId || !content) return;
  try {
    const user = await client.users.fetch(discordUserId);
    if (user) {
      await user.send(content);
    }
  } catch (error) {
    console.warn(`[Duality] Unable to DM ${discordUserId}:`, error?.message || error);
  }
}

function formatParticipant(participant) {
  if (!participant) return 'Unknown';

  const parts = [];
  if (participant.discordUserId) {
    parts.push(`<@${participant.discordUserId}>`);
  }

  if (participant.username) {
    parts.push(participant.username);
  } else if (participant.walletAddress) {
    const addr = participant.walletAddress;
    parts.push(`${addr.slice(0, 6)}…${addr.slice(-4)}`);
  }

  const karmaValue =
    participant.netKarma !== undefined && participant.netKarma !== null
      ? participant.netKarma
      : participant.karmaSnapshot;
  if (karmaValue !== undefined && karmaValue !== null) {
    parts.push(`Karma: ${karmaValue}`);
  }

  if (parts.length === 0) {
    return participant.id || 'Unknown';
  }

  return parts.join(' • ');
}

const LUMINEX_TIMEFRAMES = {
  '1h': { label: '1 Hour', resolution: 5, hours: 1 },
  '6h': { label: '6 Hours', resolution: 15, hours: 6 },
  '24h': { label: '24 Hours', resolution: 15, hours: 24 },
  '7d': { label: '7 Days', resolution: 60, hours: 24 * 7 },
};

const luminexDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

function isLuminexCommand(commandName) {
  return LUMINEX_COMMAND_NAMES.has(commandName);
}

function isAllowedLuminexChannel(channelId) {
  if (!LUMINEX_ALLOWED_CHANNEL_ID) return true;
  return channelId === LUMINEX_ALLOWED_CHANNEL_ID;
}

function getTimeframeConfig(value) {
  return LUMINEX_TIMEFRAMES[value] || LUMINEX_TIMEFRAMES['24h'];
}

function formatLuminexPrice(priceStr) {
  if (priceStr === null || priceStr === undefined) return 'N/A';
  const price = Number(priceStr);
  if (!Number.isFinite(price)) return 'N/A';
  if (price === 0) return '$0';
  if (price < 0.0001) {
    return `$${price.toExponential(4)}`;
  }
  return `$${price.toLocaleString(undefined, {
    maximumFractionDigits: 8,
    minimumFractionDigits: price >= 1 ? 2 : 4,
  })}`;
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return 'N/A';
  if (Math.abs(num) >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `$${(num / 1_000).toFixed(2)}K`;
  }
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercentChange(value) {
  if (value === null || value === undefined) return 'N/A';
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 'N/A';
  const emoji = percent >= 0 ? '🟢' : '🔴';
  return `${emoji} ${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
}

function formatRelativeTime(date) {
  if (!date) return 'N/A';
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return 'N/A';
  return `<t:${Math.floor(ts / 1000)}:R>`;
}

function getTokenDisplayName(token) {
  if (!token) return 'Unknown token';
  return token.ticker || token.symbol || token.name || token.token_identifier || 'Unknown token';
}

function mapLuminexApiToken(token) {
  if (!token) return null;

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

  return {
    pubkey: token.pubkey || token.token_identifier || token.token_address,
    token_identifier: token.token_identifier || token.token_address,
    token_address: token.token_address || token.token_identifier,
    name: token.name,
    ticker: token.ticker || token.symbol || token.name,
    symbol: token.symbol || token.ticker || token.name,
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
}

async function fetchJsonWithTimeout(url, { headers = {}, timeout = 15000, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'User-Agent': LUMINEX_USER_AGENT,
        'Accept': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 20000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': LUMINEX_USER_AGENT,
        'Accept': options.accept || 'image/png',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllLuminexTokens() {
  const collected = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${LUMINEX_API_URL}/tokens-with-pools?offset=${offset}&limit=${LUMINEX_PAGE_SIZE}&sort_by=agg_volume_24h_usd&order=desc`;

    try {
      const data = await fetchJsonWithTimeout(url, { timeout: 20000 });
      const tokens = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : [];

      if (!tokens.length) {
        hasMore = false;
        break;
      }

      collected.push(...tokens);

      if (tokens.length < LUMINEX_PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += LUMINEX_PAGE_SIZE;
        await luminexDelay(300);
      }
    } catch (error) {
      console.error('[Luminex] Token fetch error:', error.message);
      if (/403/.test(error.message)) {
        console.error('[Luminex] Received 403 from API. Will retry on next sync.');
      }
      hasMore = false;
    }
  }

  return collected;
}

async function syncLuminexTokens(force = false) {
  if (!LUMINEX_COMMANDS_ENABLED) return;
  if (luminexSyncInProgress) return;

  const now = Date.now();
  if (!force && now - luminexLastSync < LUMINEX_POLL_INTERVAL_MS) {
    return;
  }

  luminexSyncInProgress = true;

  try {
    console.log('[Luminex] Syncing tokens from Luminex API...');
    const tokens = await fetchAllLuminexTokens();
    if (!tokens.length) {
      console.log('[Luminex] No tokens received from API.');
      return;
    }

    const mapped = tokens
      .map(mapLuminexApiToken)
      .filter(token => token && token.pubkey && token.name && token.ticker);

    if (!mapped.length) {
      console.log('[Luminex] No tokens ready for upsert after normalization.');
      return;
    }

    const res = await apiFetch('/api/luminex/tokens', {
      method: 'POST',
      body: JSON.stringify({ tokens: mapped }),
    });

    if (!res.ok) {
      console.error('[Luminex] Failed to upsert tokens:', res.status, res.data);
      return;
    }

    console.log(
      `[Luminex] Upserted tokens — inserted: ${res.data?.inserted ?? 0}, updated: ${res.data?.updated ?? 0}`
    );
    luminexLastSync = Date.now();
  } catch (error) {
    console.error('[Luminex] Token sync error:', error);
  } finally {
    luminexSyncInProgress = false;
  }
}

async function getStoredLuminexToken(searchTerm) {
  const query = searchTerm?.trim();
  if (!query) return null;

  const res = await apiFetch(`/api/luminex/tokens?search=${encodeURIComponent(query)}`);
  if (!res.ok) {
    console.error('[Luminex] Token search failed:', res.status, res.data);
    return null;
  }

  const tokens = Array.isArray(res.data?.tokens) ? res.data.tokens : [];
  return tokens[0] || null;
}

async function listStoredLuminexTokens(limit = DEFAULT_TOKEN_LIST_LIMIT, offset = 0) {
  const res = await apiFetch(
    `/api/luminex/tokens?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
  );
  if (!res.ok) {
    console.error('[Luminex] Token list fetch failed:', res.status, res.data);
    return { tokens: [], total: 0 };
  }

  const tokens = Array.isArray(res.data?.tokens) ? res.data.tokens : [];
  const total = typeof res.data?.total === 'number' ? res.data.total : tokens.length;
  return { tokens, total };
}

async function fetchTokenDetailsFromLuminex(token) {
  if (!token) return null;

  const results = {
    comments: null,
    priceChanges: null,
    swaps: null,
    holders: null,
  };

  const poolLpPubkey = token.pool_lp_pubkey;
  const tokenIdentifier = token.token_identifier;

  if (poolLpPubkey) {
    try {
      const commentsRes = await fetchJsonWithTimeout(
        `${LUMINEX_API_URL}/spark-comments?pool_lp_pubkey=${encodeURIComponent(poolLpPubkey)}&limit=20&offset=0`,
        { timeout: 15000 }
      );
      results.comments = Array.isArray(commentsRes?.data) ? commentsRes.data : [];
    } catch (error) {
      console.warn('[Luminex] Comments fetch failed:', error.message);
    }

    try {
      const swapsRes = await fetchJsonWithTimeout(
        `${LUMINEX_API_URL}/spark/swaps?poolLpPubkey=${encodeURIComponent(poolLpPubkey)}&limit=10`,
        { timeout: 15000 }
      );
      results.swaps = Array.isArray(swapsRes?.data) ? swapsRes.data : [];
    } catch (error) {
      console.warn('[Luminex] Swaps fetch failed:', error.message);
    }
  }

  if (tokenIdentifier) {
    try {
      const priceChangesRes = await fetchJsonWithTimeout(
        `${LUMINEX_API_URL}/pools/${encodeURIComponent(tokenIdentifier)}/price-changes`,
        { timeout: 15000 }
      );
      results.priceChanges = priceChangesRes;
    } catch (error) {
      console.warn('[Luminex] Price change fetch failed:', error.message);
    }

    try {
      const holdersRes = await fetchJsonWithTimeout(
        `${LUMINEX_API_URL}/spark/holders?tokenIdentifier=${encodeURIComponent(tokenIdentifier)}&limit=100`,
        { timeout: 15000 }
      );
      results.holders = Array.isArray(holdersRes?.data) ? holdersRes.data : [];
    } catch (error) {
      console.warn('[Luminex] Holders fetch failed:', error.message);
    }
  }

  return results;
}

async function fetchLuminexChartData(tokenIdentifier, resolution, hours) {
  if (!tokenIdentifier) throw new Error('Token identifier required for chart data');

  const now = Math.floor(Date.now() / 1000);
  const from = now - hours * 3600;
  const to = now;
  const countback = Math.ceil((hours * 3600) / (resolution * 60));

  const url = `${LUMINEX_CHART_API_URL}/tv/chart/history?symbol=${encodeURIComponent(
    tokenIdentifier
  )}&resolution=${encodeURIComponent(resolution)}&from=${encodeURIComponent(
    from
  )}&to=${encodeURIComponent(to)}&countback=${encodeURIComponent(countback)}`;

  const data = await fetchJsonWithTimeout(url, { timeout: 20000 });
  if (!data || data.s !== 'ok' || !Array.isArray(data.t) || data.t.length === 0) {
    throw new Error(data?.s ? `Chart API returned status: ${data.s}` : 'No chart data');
  }

  return data;
}

function buildChartConfig(chartData, tokenName, timeframeLabel, currentPrice) {
  const timestamps = chartData.t || [];
  const closes = chartData.c || [];

  const labels = timestamps.map(ts => {
    const date = new Date(ts * 1000);
    return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  });

  const firstPrice = closes[0];
  const lastPrice = closes[closes.length - 1];
  const isUp = Number(lastPrice) >= Number(firstPrice);
  const chartColor = isUp ? '#00ff88' : '#ff4444';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${tokenName} (${timeframeLabel})`,
          data: closes,
          borderColor: chartColor,
          backgroundColor: `${chartColor}33`,
          fill: true,
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${tokenName} Price (${timeframeLabel})${currentPrice ? ` — ${formatLuminexPrice(currentPrice)}` : ''}`,
          color: '#ffffff',
          font: { size: 16, weight: 'bold' },
        },
        tooltip: {
          callbacks: {
            label: context => `Price: ${formatLuminexPrice(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#888888', maxTicksLimit: 10 },
          grid: { color: '#333333' },
        },
        y: {
          ticks: {
            color: '#888888',
            callback(value) {
              const num = Number(value);
              if (!Number.isFinite(num)) return value;
              if (Math.abs(num) < 0.0001) return num.toExponential(2);
              if (Math.abs(num) >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
              return num.toFixed(6);
            },
          },
          grid: { color: '#333333' },
        },
      },
      backgroundColor: '#1e1e1e',
    },
  };
}

async function generateChartAttachment(token, chartData, timeframe) {
  const tokenName = getTokenDisplayName(token);
  const config = buildChartConfig(chartData, tokenName, timeframe.label, token.price_usd);

  const buffer = await fetchBuffer(QUICKCHART_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      width: 800,
      height: 400,
      backgroundColor: '#1e1e1e',
      format: 'png',
      devicePixelRatio: 2,
      chart: config,
    }),
  });

  const fileName = `${tokenName.replace(/\s+/g, '_')}_${timeframe.label.replace(/\s+/g, '')}_chart.png`;

  return new AttachmentBuilder(buffer, {
    name: fileName,
    description: `Price chart for ${tokenName} (${timeframe.label})`,
  });
}

function createPriceEmbed(token, detailsData = null) {
  const embed = new EmbedBuilder()
    .setTitle(`${getTokenDisplayName(token)} Price Info`)
    .setColor(0x00ae86)
    .setTimestamp(new Date());

  if (token.icon_url) {
    embed.setThumbnail(token.icon_url);
  }

  const fields = [
    { name: 'Price (USD)', value: formatLuminexPrice(token.price_usd), inline: true },
    { name: '24h Volume', value: formatCurrency(token.agg_volume_24h_usd), inline: true },
    { name: 'Liquidity', value: formatCurrency(token.agg_liquidity_usd), inline: true },
  ];

  if (detailsData?.priceChanges) {
    const pc = detailsData.priceChanges;
    const timeframeKeys = ['5m', '15m', '1h', '6h', '24h'];

    const changeFields = timeframeKeys
      .map(key => {
        const value = pc[key]?.changePercent;
        if (value === null || value === undefined) return null;
        return {
          name: key.toUpperCase(),
          value: formatPercentChange(Number(value)),
          inline: true,
        };
      })
      .filter(Boolean);

    if (changeFields.length) {
      fields.push({ name: '\u200b', value: '\u200b', inline: false });
      fields.push({ name: '📊 Price Changes', value: '\u200b', inline: false });
      fields.push(...changeFields);
    }

    if (pc.lastTradeTimestamp) {
      fields.push({
        name: 'Last Trade',
        value: formatRelativeTime(pc.lastTradeTimestamp),
        inline: false,
      });
    }
  } else if (token.agg_price_change_24h_pct !== null && token.agg_price_change_24h_pct !== undefined) {
    const change = Number(token.agg_price_change_24h_pct) * 100;
    fields.push({
      name: '24h Change',
      value: formatPercentChange(change),
      inline: true,
    });
  }

  if (token.holder_count) {
    fields.push({ name: 'Holders', value: Number(token.holder_count).toLocaleString(), inline: true });
  }

  if (token.total_supply) {
    fields.push({ name: 'Total Supply', value: String(token.total_supply), inline: true });
  }

  embed.addFields(fields);

  if (token.pool_lp_pubkey) {
    embed.setFooter({ text: `Pool: ${token.pool_lp_pubkey.substring(0, 20)}...` });
  }

  if (detailsData?.comments && detailsData.comments.length > 0) {
    const topComment = detailsData.comments[0];
    embed.addFields({
      name: '💬 Latest Comment',
      value: `**${topComment.user_profile?.username || 'Anonymous'}**: ${
        topComment.content.length > 200 ? `${topComment.content.substring(0, 200)}…` : topComment.content
      }`,
      inline: false,
    });
  }

  if (detailsData?.swaps && detailsData.swaps.length > 0) {
    const recentSwaps = detailsData.swaps.slice(0, 5);
    const summary = recentSwaps.reduce(
      (acc, swap) => {
        if (swap.swap_type === 'buy') acc.buy += 1;
        else acc.sell += 1;
        return acc;
      },
      { buy: 0, sell: 0 }
    );

    const lines = recentSwaps.map(swap => {
      const isBuy = swap.swap_type === 'buy';
      const emoji = isBuy ? '🟢' : '🔴';
      const swapTime = new Date(swap.swap_timestamp);
      return `${emoji} ${isBuy ? 'BUY' : 'SELL'} ${formatLuminexPrice(
        swap.exec_price_a_in_b
      )} — ${formatRelativeTime(swapTime)}`;
    });

    embed.addFields({
      name: '📈 Recent Activity',
      value: `**${summary.buy} buys | ${summary.sell} sells** in last ${recentSwaps.length} swaps\n${lines.join('\n')}`,
      inline: false,
    });
  }

  return embed;
}

function createHoldersEmbed(token, holders = [], limit = 10) {
  if (!holders || holders.length === 0) {
    return new EmbedBuilder()
      .setTitle(`📊 Holders: ${getTokenDisplayName(token)}`)
      .setDescription('No holder data available')
      .setColor(0xffa500);
  }

  const nonPoolHolders = holders
    .filter(holder => !holder.is_pool)
    .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
    .slice(0, limit);

  const poolHolders = holders.filter(holder => holder.is_pool);

  const embed = new EmbedBuilder()
    .setTitle(`📊 Top Holders: ${getTokenDisplayName(token)}`)
    .setColor(0x00ff00);

  if (token.icon_url) {
    embed.setThumbnail(token.icon_url);
  }

  const totalSupply = holders.reduce((sum, holder) => sum + Number(holder.balance || 0), 0);

  if (nonPoolHolders.length > 0) {
    const holderLines = nonPoolHolders.map((holder, index) => {
      const balance = Number(holder.balance || 0);
      const percentage = totalSupply > 0 ? ((balance / totalSupply) * 100).toFixed(2) : '0.00';
      const address = holder.address || holder.pubkey || 'Unknown';
      const shortAddress =
        address.length > 20 ? `${address.substring(0, 10)}...${address.substring(address.length - 6)}` : address;

      return `${index + 1}. **${shortAddress}** — ${balance.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} (${percentage}%)`;
    });

    embed.addFields({
      name: `Top ${nonPoolHolders.length} Holders`,
      value: holderLines.join('\n'),
      inline: false,
    });
  }

  if (poolHolders.length > 0) {
    const poolBalance = poolHolders.reduce((sum, holder) => sum + Number(holder.balance || 0), 0);
    const poolPercentage = totalSupply > 0 ? ((poolBalance / totalSupply) * 100).toFixed(2) : '0.00';
    embed.addFields({
      name: '💰 Liquidity Pool',
      value: `${poolBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${poolPercentage}%)`,
      inline: true,
    });
  }

  embed.addFields({
    name: '📈 Statistics',
    value: `**Total Holders:** ${holders.length.toLocaleString()}\n**Total Supply:** ${totalSupply.toLocaleString(
      undefined,
      { maximumFractionDigits: 2 }
    )}`,
    inline: true,
  });

  if (token.pool_lp_pubkey) {
    embed.setFooter({ text: `Pool: ${token.pool_lp_pubkey.substring(0, 20)}...` });
  }

  return embed;
}

function createSwapsEmbed(token, swaps = [], limit = 10) {
  if (!swaps || swaps.length === 0) {
    return new EmbedBuilder()
      .setTitle(`🔄 Swaps: ${getTokenDisplayName(token)}`)
      .setDescription('No recent swap activity')
      .setColor(0xffa500);
  }

  const displaySwaps = swaps.slice(0, limit);
  const buyCount = swaps.filter(swap => swap.swap_type === 'buy').length;
  const sellCount = swaps.filter(swap => swap.swap_type === 'sell').length;

  const embed = new EmbedBuilder()
    .setTitle(`🔄 Recent Swaps: ${getTokenDisplayName(token)}`)
    .setDescription(`**${buyCount} buys | ${sellCount} sells** in last ${swaps.length} swaps`)
    .setColor(0x00ff00);

  if (token.icon_url) {
    embed.setThumbnail(token.icon_url);
  }

  const swapLines = displaySwaps.map((swap, index) => {
    const isBuy = swap.swap_type === 'buy';
    const emoji = isBuy ? '🟢' : '🔴';
    const swapTime = new Date(swap.swap_timestamp);
    const assetAAmount = Number(swap.asset_a_amount || 0);
    const assetBAmount = Number(swap.asset_b_amount || 0);

    return `${index + 1}. ${emoji} **${isBuy ? 'BUY' : 'SELL'}**\n   Price: ${formatLuminexPrice(
      swap.exec_price_a_in_b
    )}\n   Amount: ${assetAAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens for ${assetBAmount.toFixed(
      8
    )} BTC\n   ${formatRelativeTime(swapTime)}`;
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

function buildTokenListEmbed(tokens, total, offset, limit) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Top Tokens by Volume')
    .setDescription(`Showing ${tokens.length} of ${total} tokens`)
    .setColor(0x00ae86)
    .setTimestamp(new Date());

  const lines = tokens.map((token, index) => {
    const rank = offset + index + 1;
    const symbol = getTokenDisplayName(token);
    const price = formatLuminexPrice(token.price_usd);
    const volume = formatCurrency(token.agg_volume_24h_usd);

    let changeStr = 'N/A';
    if (token.agg_price_change_24h_pct !== null && token.agg_price_change_24h_pct !== undefined) {
      const change = Number(token.agg_price_change_24h_pct) * 100;
      changeStr = formatPercentChange(change);
    }

    return `${rank}. **${symbol}**\n   Price: ${price} | Volume: ${volume} | ${changeStr}`;
  });

  embed.addFields({
    name: `Rank ${offset + 1}-${offset + tokens.length}`,
    value: lines.join('\n\n'),
    inline: false,
  });

  embed.setFooter({
    text: `Use /tokens limit:${limit} offset:${offset + limit} for next page`,
  });

  return embed;
}

async function handleLuminexInteraction(interaction) {
  if (!LUMINEX_COMMANDS_ENABLED) {
    await interaction.reply({
      content: '❌ Luminex commands are currently disabled on this bot.',
      ephemeral: true,
    });
    return;
  }

  if (!isAllowedLuminexChannel(interaction.channelId)) {
    await interaction.reply({
      content: `❌ Luminex commands are restricted to <#${LUMINEX_ALLOWED_CHANNEL_ID}>.`,
      ephemeral: true,
    });
    return;
  }

  const commandName = interaction.commandName;

  if (commandName === 'tokens') {
    await interaction.deferReply();

    const limit = interaction.options.getInteger('limit') || DEFAULT_TOKEN_LIST_LIMIT;
    const offset = interaction.options.getInteger('offset') || 0;

    try {
      const { tokens, total } = await listStoredLuminexTokens(limit, offset);

      if (!tokens.length) {
        await interaction.editReply({
          content:
            total === 0
              ? '❌ No Luminex token data available yet. The bot will sync shortly.'
              : `❌ No tokens found at offset ${offset}. Try a lower offset or run /tokens again in a few minutes.`,
        });
        return;
      }

      const embed = buildTokenListEmbed(tokens, total, offset, limit);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[Luminex] /tokens error:', error);
      await interaction.editReply({
        content: `❌ Error fetching token list: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    return;
  }

  const tokenQuery = interaction.options.getString('token', true);
  await interaction.deferReply();

  let token = await getStoredLuminexToken(tokenQuery);

  if (!token) {
    await syncLuminexTokens(true);
    token = await getStoredLuminexToken(tokenQuery);
  }

  if (!token) {
    await interaction.editReply({
      content: `❌ Token "${tokenQuery}" not found in the shared database. Try another name or wait for the next sync.`,
    });
    return;
  }

  try {
    const details = await fetchTokenDetailsFromLuminex(token);

    if (commandName === 'price') {
      const embed = createPriceEmbed(token, details);
      const replyOptions = { embeds: [embed] };

      if (token.token_identifier) {
        try {
          const timeframe = getTimeframeConfig('24h');
          const chartData = await fetchLuminexChartData(
            token.token_identifier,
            timeframe.resolution,
            timeframe.hours
          );
          const attachment = await generateChartAttachment(token, chartData, timeframe);
          embed.setImage(`attachment://${attachment.name}`);
          replyOptions.files = [attachment];
        } catch (chartError) {
          console.warn('[Luminex] Price chart generation failed:', chartError.message);
        }
      }

      await interaction.editReply(replyOptions);
      return;
    }

    if (commandName === 'holders') {
      const limit = interaction.options.getInteger('limit') || 10;
      const embed = createHoldersEmbed(token, details?.holders || [], limit);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'swaps') {
      const limit = interaction.options.getInteger('limit') || 10;
      const embed = createSwapsEmbed(token, details?.swaps || [], limit);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (commandName === 'chart') {
      if (!token.token_identifier) {
        await interaction.editReply({
          content: `❌ Token identifier not available for "${tokenQuery}".`,
        });
        return;
      }

      const timeframeValue = interaction.options.getString('timeframe') || '24h';
      const timeframe = getTimeframeConfig(timeframeValue);

      try {
        const chartData = await fetchLuminexChartData(
          token.token_identifier,
          timeframe.resolution,
          timeframe.hours
        );
        const attachment = await generateChartAttachment(token, chartData, timeframe);

        const embed = new EmbedBuilder()
          .setTitle(`📈 Price Chart: ${getTokenDisplayName(token)}`)
          .setDescription(`Timeframe: ${timeframe.label}`)
          .setColor(0x00ff00)
          .setImage(`attachment://${attachment.name}`)
          .setTimestamp(new Date());

        if (token.icon_url) {
          embed.setThumbnail(token.icon_url);
        }

        await interaction.editReply({
          embeds: [embed],
          files: [attachment],
        });
      } catch (chartError) {
        console.error('[Luminex] /chart error:', chartError);
        await interaction.editReply({
          content: `❌ Error generating chart: ${chartError instanceof Error ? chartError.message : 'Unknown error'}`,
        });
      }
      return;
    }

    if (commandName === 'info') {
      const embed = createPriceEmbed(token, details);

      if (details?.holders && details.holders.length > 0) {
        const topHolders = details.holders
          .filter(holder => !holder.is_pool)
          .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
          .slice(0, 5);

        if (topHolders.length > 0) {
          const holderLines = topHolders.map((holder, index) => {
            const balance = Number(holder.balance || 0);
            const address = holder.address || holder.pubkey || 'Unknown';
            const shortAddress =
              address.length > 20 ? `${address.substring(0, 10)}...${address.substring(address.length - 6)}` : address;
            return `${index + 1}. ${shortAddress}: ${balance.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}`;
          });

          embed.addFields({
            name: '🏆 Top 5 Holders',
            value: holderLines.join('\n'),
            inline: false,
          });
        }
      }

      const replyOptions = { embeds: [embed] };

      if (token.token_identifier) {
        try {
          const timeframe = getTimeframeConfig('24h');
          const chartData = await fetchLuminexChartData(
            token.token_identifier,
            timeframe.resolution,
            timeframe.hours
          );
          const attachment = await generateChartAttachment(token, chartData, timeframe);
          embed.setImage(`attachment://${attachment.name}`);
          replyOptions.files = [attachment];
        } catch (chartError) {
          console.warn('[Luminex] Info chart generation failed:', chartError.message);
        }
      }

      await interaction.editReply(replyOptions);
      return;
    }
  } catch (error) {
    console.error(`[Luminex] /${commandName} error:`, error);
    await interaction.editReply({
      content: `❌ Error handling /${commandName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}


// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (isLuminexCommand(interaction.commandName)) {
    try {
      await handleLuminexInteraction(interaction);
    } catch (error) {
      console.error('[Luminex] Interaction handler error:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ Error handling command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: `❌ Error handling command: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ephemeral: true,
        }).catch(() => {});
      }
    }
    return;
  }

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

// Periodic job to check holders and manage roles (runs every hour)
if (LUMINEX_COMMANDS_ENABLED) {
  setInterval(async () => {
    try {
      await syncLuminexTokens();
    } catch (error) {
      console.error('[Luminex] Scheduled token sync error:', error);
    }
  }, LUMINEX_POLL_INTERVAL_MS);
}

setInterval(async () => {
  try {
    console.log('🔄 Running periodic holder role check...');
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
      
    // Get Discord IDs that should have role removed (0 ordinals)
    const removeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/discord/roles/list?action=remove`
    );
    
    if (!removeResponse.ok) {
      console.error('Failed to fetch users to remove roles:', removeResponse.status);
      return;
    }
    
    const removeData = await removeResponse.json();
    let removedCount = 0;
    
    if (removeData.discordIds && removeData.discordIds.length > 0) {
      // Remove roles from users who no longer have ordinals
      for (const discordId of removeData.discordIds) {
        try {
          const member = await guild.members.fetch(discordId);
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            removedCount++;
            console.log(`✅ Removed holder role from ${member.user.tag} (${discordId}) - no longer has ordinals`);
          }
        } catch (error) {
          console.error(`Error removing role from ${discordId}:`, error);
        }
      }
    }
    
    // Get Discord IDs that should have role added (> 0 ordinals)
    const addResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/discord/roles/list?action=add`
    );
    
    if (!addResponse.ok) {
      console.error('Failed to fetch users to add roles:', addResponse.status);
      return;
    }
    
    const addData = await addResponse.json();
    let addedCount = 0;
    
    if (addData.discordIds && addData.discordIds.length > 0) {
      // Add roles to users who have ordinals but don't have the role
      for (const discordId of addData.discordIds) {
        try {
          const member = await guild.members.fetch(discordId);
          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            addedCount++;
            console.log(`✅ Added holder role to ${member.user.tag} (${discordId}) - has ordinals`);
          }
        } catch (error) {
          console.error(`Error adding role to ${discordId}:`, error);
        }
      }
    }
    
    console.log(`✅ Periodic check complete: Removed ${removedCount} roles, Added ${addedCount} roles`);
  } catch (error) {
    console.error('Error in periodic holder role check:', error);
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

// Duality protocol automation (placeholder cadence every 15 minutes)
setInterval(async () => {
  try {
    console.log('[Duality] Scheduled automation tick...');
    await handleDualityWeeklyCycle(client);
  } catch (error) {
    console.error('[Duality] Automation tick error:', error);
  }
}, 900000); // 15 minutes

// Bot ready event
client.once(Events.ClientReady, async () => {
  console.log(`✅ Discord bot is ready! Logged in as ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`Verify API URL: ${VERIFY_API_URL}`);
  console.log(`Guild ID: ${process.env.GUILD_ID}`);
  console.log(`Client ID: ${process.env.CLIENT_ID}`);
  console.log(`Holder Role ID: ${process.env.HOLDER_ROLE_ID}`);
  await registerCommands();
  if (LUMINEX_COMMANDS_ENABLED) {
    await syncLuminexTokens(true);
  }
  await handleDualityWeeklyCycle(client);
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
