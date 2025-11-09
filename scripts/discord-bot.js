const {
  Client,
  GatewayIntentBits,
  Events,
  Collection,
  REST,
  Routes,
  ApplicationCommandOptionType,
  EmbedBuilder,
} = require('discord.js');
const fetch = require('node-fetch');
const { FlashnetClient } = require('@flashnet/sdk');
const { SparkWallet } = require('@buildonspark/spark-sdk');
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
const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.thedamned.xyz';

const FLASHNET_MNEMONIC = process.env.FLASHNET_MNEMONIC || process.env.SPARK_MNEMONIC;
const FLASHNET_NETWORK = (process.env.FLASHNET_NETWORK || 'MAINNET').toUpperCase();
const parsedFlashnetInterval = Number(process.env.FLASHNET_POLL_INTERVAL_MS || 5 * 60 * 1000);
const FLASHNET_POLL_INTERVAL_MS = Number.isFinite(parsedFlashnetInterval)
  ? Math.max(60_000, parsedFlashnetInterval)
  : 5 * 60 * 1000;
const FLASHNET_ALLOWED_CHANNEL_ID =
  process.env.FLASHNET_CHANNEL_ID ||
  process.env.FLASHNET_ALLOWED_CHANNEL_ID ||
  process.env.DISCORD_FLASHNET_CHANNEL_ID ||
  null;
const FLASHNET_COMMANDS_ENABLED =
  process.env.ENABLE_FLASHNET_COMMANDS !== 'false' && process.env.ENABLE_LUMINEX_COMMANDS !== 'false';
const FLASHNET_PAGE_SIZE = Number.isFinite(Number(process.env.FLASHNET_PAGE_SIZE))
  ? Math.max(1, Math.min(50, Number(process.env.FLASHNET_PAGE_SIZE)))
  : 20;
const FLASHNET_MAX_SYNC_POOLS = Number.isFinite(Number(process.env.FLASHNET_MAX_SYNC_POOLS))
  ? Math.max(20, Math.min(200, Number(process.env.FLASHNET_MAX_SYNC_POOLS)))
  : 100;
const FLASHNET_COMMAND_NAMES = new Set(['price', 'info', 'tokens']);
const DEFAULT_POOL_LIST_LIMIT = Number.isFinite(Number(process.env.FLASHNET_TOKENS_LIMIT))
  ? Math.max(1, Math.min(50, Number(process.env.FLASHNET_TOKENS_LIMIT)))
  : 10;
let flashnetClientPromise = null;
let flashnetSyncInProgress = false;
let flashnetLastSync = 0;

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
  description: 'Get price information for a Flashnet pool',
  options: [
    {
      name: 'token',
      type: ApplicationCommandOptionType.String,
      description: 'Token name, ticker, or symbol',
      required: true,
    },
  ],
};

const infoCommand = {
  name: 'info',
  description: 'Show a comprehensive summary for a Flashnet pool',
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
  description: 'List top Flashnet pools from the shared database',
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
  const url = `${SITE_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
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
    if (FLASHNET_COMMANDS_ENABLED) {
      commands.push(priceCommand, infoCommand, tokensCommand);
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

  const readyGood = participants.filter(
    (p) =>
      p.alignment === 'good' &&
      p.readyForPairing &&
      !p.currentPairId &&
      (!p.nextAvailableAt || new Date(p.nextAvailableAt).getTime() <= now)
  );
  const readyEvil = participants.filter(
    (p) =>
      p.alignment === 'evil' &&
      p.readyForPairing &&
      !p.currentPairId &&
      (!p.nextAvailableAt || new Date(p.nextAvailableAt).getTime() <= now)
  );

  const canPairOpposites = readyGood.length > 0 && readyEvil.length > 0;
  const canPairSameGood = readyGood.length >= 2;
  const canPairSameEvil = readyEvil.length >= 2;
  const canAttemptPairing = canPairOpposites || canPairSameGood || canPairSameEvil;

  if (canAttemptPairing) {
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

    const sameAlignment = Boolean(pair.sameAlignment);
    const sameAlignmentLabel =
      sameAlignment && pair.alignment
        ? pair.alignment === 'evil'
          ? 'Same-Side Pairing — Evil'
          : 'Same-Side Pairing — Good'
        : null;

    const windowEnd = pair.windowEnd ? new Date(pair.windowEnd) : null;
    const windowEndText = windowEnd ? `<t:${Math.floor(windowEnd.getTime() / 1000)}:R>` : `${PAIRING_WINDOW_MINUTES} minutes`;
    const cooldownText = `${pair.cooldownMinutes ?? PAIRING_COOLDOWN_MINUTES} minutes`;

    const embed = new EmbedBuilder()
      .setTitle(sameAlignmentLabel ? '🪞 Same-Side Duality Pairing' : '🔗 New Duality Pairing Window')
      .setDescription(
        sameAlignmentLabel
          ? `${sameAlignmentLabel}\n\nTwo holders from the same alignment have been paired for this window.`
          : 'Opposing holders have been paired for the next challenge slot.'
      )
      .addFields(
        {
          name: sameAlignment ? 'Partner A' : 'Good Holder',
          value: formatParticipant(good),
          inline: true,
        },
        {
          name: sameAlignment ? 'Partner B' : 'Evil Holder',
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

    if (sameAlignmentLabel) {
      embed.addFields({
        name: 'Alignment Context',
        value: pair.alignment === 'evil' ? 'Both holders are aligned with Evil.' : 'Both holders are aligned with Good.',
        inline: false,
      });
    }

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

    const dmMessage = sameAlignmentLabel
      ? `🪞 **Same-Side Duality Pairing Active**\nYou have been paired with another ${
          pair.alignment === 'evil' ? 'Evil' : 'Good'
        } holder.\nYour window ends ${windowEndText}. Coordinate together, then you will enter a ${cooldownText} cooldown.`
      : `🔗 **Duality Pairing Active**\nYour window ends ${windowEndText}. Coordinate with your partner and complete your objectives, then you will enter a ${cooldownText} cooldown.`;
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

// Flashnet helpers ---------------------------------------------------------

function isFlashnetCommand(commandName) {
  return FLASHNET_COMMAND_NAMES.has(commandName);
}

function isAllowedFlashnetChannel(channelId) {
  if (!FLASHNET_ALLOWED_CHANNEL_ID) return true;
  return channelId === FLASHNET_ALLOWED_CHANNEL_ID;
}

function formatCurrency(value) {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (!Number.isFinite(num)) return 'N/A';
  if (Math.abs(num) >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (!Number.isFinite(num)) return 'N/A';
  const emoji = num >= 0 ? '🟢' : '🔴';
  return `${emoji} ${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (!Number.isFinite(num)) return 'N/A';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getPoolDisplayName(pool) {
  if (!pool) return 'Unknown pool';
  const symbolA = getTokenSymbol(pool, 'a');
  const symbolB = getTokenSymbol(pool, 'b');
  if (symbolA && symbolB) {
    return `${symbolA}/${symbolB}`;
  }
  const nameA = getTokenName(pool, 'a');
  const nameB = getTokenName(pool, 'b');
  if (nameA && nameB) {
    return `${nameA}/${nameB}`;
  }
  return `${formatAddress(pool.asset_a_address)}/${formatAddress(pool.asset_b_address)}`;
}

function getTokenMetadataForSide(pool, side) {
  return pool?.[`asset_${side}_metadata`] || null;
}

function getTokenSymbol(pool, side) {
  const metadata = getTokenMetadataForSide(pool, side);
  if (metadata?.ticker) return metadata.ticker;
  const symbol = pool?.[`asset_${side}_symbol`];
  return symbol || null;
}

function getTokenName(pool, side) {
  const metadata = getTokenMetadataForSide(pool, side);
  if (metadata?.name) return metadata.name;
  const name = pool?.[`asset_${side}_name`];
  return name || null;
}

function getTokenDecimals(pool, side) {
  const metadata = getTokenMetadataForSide(pool, side);
  const decimals =
    metadata?.decimals ??
    (pool?.[`asset_${side}_decimals`] !== undefined ? pool[`asset_${side}_decimals`] : null);
  return decimals !== null && decimals !== undefined ? Number(decimals) : null;
}

function getTokenIcon(pool, side) {
  const metadata = getTokenMetadataForSide(pool, side);
  return metadata?.icon_url || null;
}

function formatAddress(address) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTokenSummary(pool, side) {
  const lines = [];
  const symbol = getTokenSymbol(pool, side);
  const name = getTokenName(pool, side);
  if (symbol && name && symbol !== name) {
    lines.push(`**${symbol}** — ${name}`);
  } else if (symbol || name) {
    lines.push(`**${symbol || name}**`);
  }
  const decimals = getTokenDecimals(pool, side);
  if (decimals !== null) {
    lines.push(`Decimals: ${decimals}`);
  }
  const metadata = getTokenMetadataForSide(pool, side);
  if (metadata?.max_supply) {
    lines.push(`Max Supply: ${formatNumber(metadata.max_supply)}`);
  }
  lines.push(`Address: ${formatAddress(pool?.[`asset_${side}_address`])}`);
  return lines.join('\n');
}

async function getFlashnetClientInstance() {
  if (flashnetClientPromise) return flashnetClientPromise;
  if (!FLASHNET_MNEMONIC) {
    throw new Error('FLASHNET_MNEMONIC (or SPARK_MNEMONIC) is not set');
  }

  flashnetClientPromise = (async () => {
    const { wallet } = await SparkWallet.initialize({
      mnemonicOrSeed: FLASHNET_MNEMONIC,
      options: { network: FLASHNET_NETWORK },
    });
    const client = new FlashnetClient(wallet);
    await client.initialize();
    return client;
  })();

  return flashnetClientPromise;
}

async function listFlashnetPoolsFromSdk(limit, offset) {
  const client = await getFlashnetClientInstance();
  return client.listPools({
    limit,
    offset,
    sort: 'TVL_DESC',
  });
}

async function syncFlashnetPools(force = false) {
  if (!FLASHNET_COMMANDS_ENABLED) return;
  if (flashnetSyncInProgress) return;

  const now = Date.now();
  if (!force && now - flashnetLastSync < FLASHNET_POLL_INTERVAL_MS) {
    return;
  }

  flashnetSyncInProgress = true;

  try {
    console.log('[Flashnet] Syncing pools from Flashnet SDK...');
    const allPools = [];
    let offset = 0;

    while (allPools.length < FLASHNET_MAX_SYNC_POOLS) {
      const page = await listFlashnetPoolsFromSdk(FLASHNET_PAGE_SIZE, offset);
      const pools = Array.isArray(page?.pools) ? page.pools : Array.isArray(page) ? page : [];

      if (!pools.length) break;

      allPools.push(...pools);

      if (pools.length < FLASHNET_PAGE_SIZE) {
        break;
      }

      offset += FLASHNET_PAGE_SIZE;
    }

    if (!allPools.length) {
      console.log('[Flashnet] No pools returned from SDK.');
      return;
    }

    const payload = allPools.slice(0, FLASHNET_MAX_SYNC_POOLS);

    const res = await apiFetch('/api/flashnet/pools', {
      method: 'POST',
      body: JSON.stringify({ pools: payload }),
    });

    if (!res.ok) {
      console.error('[Flashnet] Failed to upsert pools:', res.status, res.data);
      return;
    }

    console.log(
      `[Flashnet] Upserted pools — inserted: ${res.data?.inserted ?? 0}, updated: ${res.data?.updated ?? 0}`
    );
    flashnetLastSync = Date.now();
  } catch (error) {
    console.error('[Flashnet] Pool sync error:', error);
  } finally {
    flashnetSyncInProgress = false;
  }
}

async function getStoredFlashnetPool(searchTerm) {
  const query = searchTerm?.trim();
  if (!query) return null;

  const res = await apiFetch(`/api/flashnet/pools?search=${encodeURIComponent(query)}`);
  if (!res.ok) {
    console.error('[Flashnet] Pool search failed:', res.status, res.data);
    return null;
  }

  const pools = Array.isArray(res.data?.pools) ? res.data.pools : [];
  if (!pools.length) {
    console.warn('[Flashnet] Pool search returned no results', {
      search: query,
      total: res.data?.total,
      count: res.data?.count,
    });
  } else {
    console.log('[Flashnet] Pool search matched', {
      search: query,
      firstMatch: getPoolDisplayName(pools[0]),
      total: pools.length,
    });
  }
  return pools[0] || null;
}

async function listStoredFlashnetPools(limit = DEFAULT_POOL_LIST_LIMIT, offset = 0) {
  const res = await apiFetch(
    `/api/flashnet/pools?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
  );
  if (!res.ok) {
    console.error('[Flashnet] Pool list fetch failed:', res.status, res.data);
    return { pools: [], total: 0 };
  }

  const pools = Array.isArray(res.data?.pools) ? res.data.pools : [];
  const total = typeof res.data?.total === 'number' ? res.data.total : pools.length;
  return { pools, total };
}

function buildPoolEmbed(pool) {
  const embed = new EmbedBuilder()
    .setTitle(`${getPoolDisplayName(pool)} — Flashnet`)
    .setColor(0x0080ff)
    .setTimestamp(new Date());

  const icon = getTokenIcon(pool, 'a') || getTokenIcon(pool, 'b');
  if (icon) {
    embed.setThumbnail(icon);
  }

  embed.addFields(
    { name: 'TVL (Asset B)', value: formatCurrency(pool.tvl_asset_b), inline: true },
    { name: '24h Volume', value: formatCurrency(pool.volume_24h_asset_b), inline: true },
    { name: 'Price A in B', value: formatNumber(pool.current_price_a_in_b), inline: true },
  );

  embed.addFields(
    { name: '24h Change', value: formatPercent(pool.price_change_percent_24h), inline: true },
    { name: 'LP Fee (bps)', value: pool.lp_fee_bps !== null ? String(pool.lp_fee_bps) : 'N/A', inline: true },
    { name: 'Host Fee (bps)', value: pool.host_fee_bps !== null ? String(pool.host_fee_bps) : 'N/A', inline: true },
  );

  embed.addFields(
    { name: 'Asset A', value: formatTokenSummary(pool, 'a'), inline: true },
    { name: 'Asset B', value: formatTokenSummary(pool, 'b'), inline: true },
  );

  embed.setFooter({
    text: `Pool ID: ${pool.lp_public_key}`,
  });

  return embed;
}

function buildPoolListEmbed(pools, total, offset, limit) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Flashnet Pools')
    .setDescription(`Showing ${pools.length} of ${total}`)
    .setColor(0x0080ff)
    .setTimestamp(new Date());

  const lines = pools.map((pool, index) => {
    const rank = offset + index + 1;
    const label = getPoolDisplayName(pool);
    const tvl = formatCurrency(pool.tvl_asset_b);
    const volume = formatCurrency(pool.volume_24h_asset_b);
    const symbolA = getTokenSymbol(pool, 'a');
    const symbolB = getTokenSymbol(pool, 'b');
    const pair = symbolA && symbolB ? `${symbolA}/${symbolB}` : label;
    return `${rank}. **${pair}**\n   TVL: ${tvl} | 24h Vol: ${volume}`;
  });

  embed.addFields({
    name: `Rank ${offset + 1}-${offset + pools.length}`,
    value: lines.join('\n\n'),
    inline: false,
  });

  embed.setFooter({
    text: `Use /tokens limit:${limit} offset:${offset + limit} for next page`,
  });

  return embed;
}

async function handleFlashnetInteraction(interaction) {
  if (!FLASHNET_COMMANDS_ENABLED) {
    await interaction.reply({
      content: '❌ Flashnet commands are currently disabled on this bot.',
      ephemeral: true,
    });
    return;
  }

  if (!isAllowedFlashnetChannel(interaction.channelId)) {
    await interaction.reply({
      content: `❌ Flashnet commands are restricted to <#${FLASHNET_ALLOWED_CHANNEL_ID}>.`,
      ephemeral: true,
    });
    return;
  }

  const commandName = interaction.commandName;

  if (commandName === 'tokens') {
    await interaction.deferReply();
    const limit = interaction.options.getInteger('limit') || DEFAULT_POOL_LIST_LIMIT;
    const offset = interaction.options.getInteger('offset') || 0;

    try {
      const { pools, total } = await listStoredFlashnetPools(limit, offset);

      if (!pools.length) {
        await interaction.editReply({
          content:
            total === 0
              ? '❌ No Flashnet pool data available yet. The bot will sync shortly.'
              : `❌ No pools found at offset ${offset}. Try a lower offset or wait for the next sync.`,
        });
        return;
      }

      const embed = buildPoolListEmbed(pools, total, offset, limit);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[Flashnet] /tokens error:', error);
      await interaction.editReply({
        content: `❌ Error fetching pool list: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
    return;
  }

  const query = interaction.options.getString('token', true);
  await interaction.deferReply();

  let pool = await getStoredFlashnetPool(query);

  if (!pool) {
    await syncFlashnetPools(true);
    pool = await getStoredFlashnetPool(query);
  }

  if (!pool) {
    await interaction.editReply({
      content: `❌ Pool "${query}" not found in the Flashnet database. Try another identifier or wait for the next sync.`,
    });
    return;
  }

  try {
    const embed = buildPoolEmbed(pool);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[Flashnet] Command error:', error);
    await interaction.editReply({
      content: `❌ Error handling /${commandName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}


// Handle slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (isFlashnetCommand(interaction.commandName)) {
    try {
      await handleFlashnetInteraction(interaction);
    } catch (error) {
      console.error('[Flashnet] Interaction handler error:', error);
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
if (FLASHNET_COMMANDS_ENABLED) {
  setInterval(async () => {
    try {
      await syncFlashnetPools();
    } catch (error) {
      console.error('[Flashnet] Scheduled pool sync error:', error);
    }
  }, FLASHNET_POLL_INTERVAL_MS);
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
  if (FLASHNET_COMMANDS_ENABLED) {
    await syncFlashnetPools(true);
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
