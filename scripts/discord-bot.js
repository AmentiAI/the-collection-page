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

const HOLDERS_CHANNEL_ID = process.env.HOLDERS_CHANNEL_ID;
const HOLDER_ROLE_ID = process.env.HOLDER_ROLE_ID;
const BOT_STATUS_CHANNEL_ID = process.env.BOT_STATUS_CHANNEL_ID;
const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL;
const DUALITY_TRIAL_CHANNEL_ID = process.env.DUALITY_TRIAL_CHANNEL_ID || '1435901975383507037';
const DUALITY_EVENTS_CHANNEL_ID = process.env.DUALITY_EVENTS_CHANNEL_ID;
const DUALITY_PARTICIPANT_ROLE_ID = process.env.DUALITY_PARTICIPANT_ROLE_ID;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.thedamned.xyz';
const EXECUTIONER_ROLE_ID = process.env.EXECUTIONER_ROLE_ID || '1437820365991837859';
const SUMMONER_ROLE_ID = process.env.SUMMONER_ROLE_ID || '1437895763308052601';
const DEAD_DEMON_ROLE_ID = process.env.DEAD_DEMON_ROLE_ID || '1440686851542352003';
const GRAVE_ROBBER_ROLE_ID = process.env.GRAVE_ROBBER_ROLE_ID || '1442345905578573987';
const HORDE_SLAYER_ROLE_ID = process.env.HORDE_SLAYER_ROLE_ID || '1450234372363128973';

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

// Damned Rumble Role ID (who can start the game)
const RUMBLE_ADMIN_ROLE_ID = '1434437623987830894';

// Active rumble games
const activeRumbles = new Map();

// Lore-based death messages inspired by chat history
const RUMBLE_DEATH_MESSAGES = [
  // Horde & Battle themed
  (killer, victim) => `💀 **${killer}** summoned the Horde upon **${victim}**! They took double digit damage and couldn't recover.`,
  (killer, victim) => `⚔️ **${victim}** missed the crawl timer and **${killer}** took advantage of the opening!`,
  (killer, victim) => `🩸 **${killer}** caught **${victim}** during an overdue message popup. Brutal execution!`,
  (killer, victim) => `💀 **${victim}** was too busy crystallizing when **${killer}** struck from behind!`,
  (killer, victim) => `⚡ **${killer}** used a 170 power angel with 40% block chance on **${victim}**. No survivors.`,
  (killer, victim) => `🔥 The resurrection cost was too high for **${victim}** after **${killer}**'s assault!`,
  (killer, victim) => `💀 **${killer}** stole **${victim}**'s pool of healing! They bled out in the abyss.`,
  (killer, victim) => `☠️ **${victim}** set a timer but **${killer}** attacked anyway. RIP hogonie.`,
  (killer, victim) => `⚔️ **${killer}** dropped from 1st to 7th... but took **${victim}** with them!`,
  (killer, victim) => `💀 **${victim}** was grinding leaderboard points when **${killer}** reminded them this is a battle royale!`,
  
  // Community meme themed
  (killer, victim) => `🧂 **${killer}** threw salt and vinegar chips in **${victim}**'s eyes, then finished them off!`,
  (killer, victim) => `💀 **${victim}** posted "LFG" but **${killer}** had other plans. L.`,
  (killer, victim) => `🌀 **${killer}** opened the abyss directly under **${victim}**!`,
  (killer, victim) => `💀 **${victim}** said "gm" but **${killer}** said "gn" PERMANENTLY.`,
  (killer, victim) => `⚡ **${killer}** challenged **${victim}** to a trial by combat. The jury voted condemn.`,
  (killer, victim) => `💀 **${victim}** was checking their powder balance when **${killer}** struck!`,
  (killer, victim) => `☠️ **${killer}** merged wallets with **${victim}**... by force!`,
  (killer, victim) => `💀 "The math ain't mathing" said **${victim}** before **${killer}** proved them right.`,
  (killer, victim) => `🔥 **${killer}** caught **${victim}** during their wifi outage over Western Africa!`,
  (killer, victim) => `💀 **${victim}** was typing a 10 paragraph analysis when **${killer}** simply attacked.`,
  
  // Dramatic lore kills
  (killer, victim) => `⚔️ **${killer}**'s demon army overwhelmed **${victim}**'s angels. Balance is restored.`,
  (killer, victim) => `💀 **${victim}** ascended... to the graveyard. Courtesy of **${killer}**.`,
  (killer, victim) => `☠️ The Horde grows stronger. **${killer}** fed it **${victim}**'s soul.`,
  (killer, victim) => `💀 **${victim}** missed the buff window. **${killer}** didn't miss their swing.`,
  (killer, victim) => `⚡ Mr.BRC would be proud... **${killer}** just executed **${victim}** flawlessly!`,
];

// Survival/miss messages
const RUMBLE_SURVIVE_MESSAGES = [
  (player) => `🛡️ **${player}** blocked with 40% chance and SURVIVED!`,
  (player) => `🍀 **${player}** was AFK eating salt and vinegar chips but somehow lived!`,
  (player) => `🏃 **${player}** ran to the Pool of Healing just in time!`,
  (player) => `⚡ **${player}** hid in a summoning circle and avoided all damage!`,
  (player) => `🙏 **${player}**'s resurrection cost was waived by the gods. They live!`,
  (player) => `🛡️ **${player}** activated their buff and tanked everything!`,
  (player) => `🍀 **${player}** set a timer and actually made it back in time!`,
  (player) => `🏃 **${player}** crystallized their body and became untouchable!`,
  (player) => `⚡ **${player}** checked in with /duality and gained divine protection!`,
  (player) => `🙏 The abyss rejected **${player}**'s soul. They crawl back!`,
];

// Random action messages (doing nothing useful but surviving)
const RUMBLE_RANDOM_ACTIONS = [
  (player) => `🤔 **${player}** is busy doing leaderboard math... and somehow survived!`,
  (player) => `😴 **${player}** fell asleep grinding but the Horde passed them by!`,
  (player) => `📱 **${player}** was DMing BRC about the algorithm and lived!`,
  (player) => `🎮 **${player}** was too busy complaining about overdue messages to die!`,
  (player) => `☕ **${player}** took a piss break but the attackers missed!`,
  (player) => `📊 **${player}** is still calculating the 28x multiplier... still alive!`,
  (player) => `🗣️ **${player}** was yelling "@everyone CIRCLES FLOWING" and nobody attacked!`,
  (player) => `🤷 **${player}** has 100% portfolio conviction. The universe respects that.`,
  (player) => `🎫 **${player}** made a ticket and is still waiting... Day 3 of hoping for a response.`,
  (player) => `⏳ **${player}** has PENDING SIGNATURE issues so nobody can kill them!`,
  (player) => `🦡 **${player}** DMed Mr.BRC but he said "everyone has to wait idk what else to say"`,
];

// More edgy death messages
const RUMBLE_DEATH_MESSAGES_EXTENDED = [
  // Ticket/Support themed
  (killer, victim) => `🎫 **${victim}** made a ticket. **${killer}** closed it... permanently.`,
  (killer, victim) => `💀 **${victim}**'s ascension failed and **${killer}** didn't wait for it to come back.`,
  (killer, victim) => `☠️ **${killer}** graverobbed **${victim}**'s corpse before they could respawn!`,
  (killer, victim) => `💀 **${victim}** had a PENDING SIGNATURE for 3 days. **${killer}** signed their death certificate instead.`,
  (killer, victim) => `🦡 **${victim}** was waiting for BRC to answer. **${killer}** answered first. With violence.`,
  
  // Dungeon/Wave themed
  (killer, victim) => `⚔️ The Dungeon 1st wave opened and **${killer}** pushed **${victim}** into the Horde Minions!`,
  (killer, victim) => `💀 **${victim}** thought the mint button would save them. It didn't. **${killer}** did the opposite.`,
  (killer, victim) => `☠️ **${killer}** caught **${victim}** stuck in "read the comments" mode. Easy kill.`,
  
  // Edgy adult humor
  (killer, victim) => `💀 **${killer}** told **${victim}** to touch grass. Then buried them under it.`,
  (killer, victim) => `☠️ **${victim}** said "no stress it'll open" and **${killer}** opened their skull instead.`,
  (killer, victim) => `💀 **${killer}** speedran **${victim}**'s existence. Any% no resurrection.`,
  (killer, victim) => `⚰️ **${victim}** picked a burn, and it failed. Then **${killer}** picked them. Also failed... to survive.`,
  (killer, victim) => `💀 **${killer}** sent **${victim}** to the shadow realm. No ticket support there.`,
  (killer, victim) => `☠️ **${victim}** was part of a wider issue. The issue was **${killer}**.`,
  (killer, victim) => `💀 **${killer}** didn't realize **${victim}**'s problem was about to get permanent.`,
  (killer, victim) => `⚔️ **${victim}** said "Thanks guys." Those were their last words before **${killer}** struck.`,
  (killer, victim) => `💀 **${killer}** gave **${victim}** the ol' "disabled for everyone" treatment.`,
  (killer, victim) => `☠️ **${victim}** just needed a lil more time. **${killer}** disagreed.`,
  (killer, victim) => `💀 **${killer}** treated **${victim}** like a bug report: acknowledged and then ignored to death.`,
  (killer, victim) => `⚰️ **${victim}**'s demon is still stuck. Unlike them, who is now very much unstuck from life.`,
];

// Chaos event messages
const RUMBLE_CHAOS_RESURRECTION = [
  `# 🌟 THE ABYSS REJECTS ALL SOULS! 🌟\n\n*A blinding light fills the arena...*\n\n**ALL FALLEN WARRIORS HAVE BEEN RESURRECTED!**\n\n💀 → 😤 The dead rise again! LET THE CARNAGE CONTINUE!`,
  `# ⚡ MR.BRC INTERVENES! ⚡\n\n*"everyone has to wait idk what else to say... so I'm bringing everyone back"*\n\n**ALL PLAYERS RESURRECTED!** The rumble continues!`,
  `# 🦡 DIVINE INTERVENTION! 🦡\n\n*The graveyard malfunctions and all corpses respawn!*\n\n**RESURRECTION COMPLETE!** Nobody stays dead today!`,
];

const RUMBLE_CHAOS_MASSACRE = [
  (survivor) => `# 💀 CATASTROPHIC EVENT! 💀\n\n*The Horde Minions breach the arena!*\n\n**EVERYONE IS SLAUGHTERED** except **${survivor}** who hid in a ticket queue!\n\n🩸 *The massacre is complete...* 🩸`,
  (survivor) => `# ☠️ THE ABYSS OPENS! ☠️\n\n*A portal to hell consumes the battlefield!*\n\n**ALL WARRIORS FALL** except **${survivor}** who was stuck on "PENDING SIGNATURE"!\n\n💀 *Only one remains...* 💀`,
  (survivor) => `# 🔥 DUNGEON WAVE: EXTINCTION! 🔥\n\n*The 1st wave was actually the LAST wave!*\n\n**TOTAL ANNIHILATION!** Only **${survivor}** survived by playing dead!\n\n⚰️ *It's over.* ⚰️`,
  (survivor) => `# 💥 ASCENSION FAILURE: CRITICAL! 💥\n\n*Everyone picked a burn... AND IT FAILED CATASTROPHICALLY!*\n\n**MASS EXTINCTION!** **${survivor}** didn't pick one and lives!\n\n🦡 *Mr.BRC: "just wait for the respawn button to return"* 🦡`,
];

// Slash command handler
client.commands = new Collection();

const checkHoldersCommand = {
  name: 'checkholders',
  description: 'Check all holders and remove roles from those who no longer have ordinals (Admin only)',
};

const checkinCommand = {
  name: 'checkin',
  description: 'Check in daily to receive +5 karma points (once every 24 hours)',
};

const dualityCommand = {
  name: 'duality',
  description: 'Check in to your active Duality pairing window',
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

const tipCommand = {
  name: 'tip',
  description: 'Tip ascension powder to another user',
  options: [
    {
      name: 'user',
      type: ApplicationCommandOptionType.User,
      description: 'The user to tip',
      required: true,
    },
    {
      name: 'amount',
      type: ApplicationCommandOptionType.Integer,
      description: 'Amount of ascension powder to tip',
      required: true,
      min_value: 1,
    },
  ],
};

const powderCommand = {
  name: 'powder',
  description: 'Check your ascension powder balance',
};

const damnedrumbleCommand = {
  name: 'damnedrumble',
  description: 'Start a Damned Rumble battle royale! Last one standing wins.',
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

    const commands = [checkHoldersCommand, checkinCommand, dualityCommand, tipCommand, powderCommand, damnedrumbleCommand];
    if (FLASHNET_COMMANDS_ENABLED) {
      commands.push(priceCommand, infoCommand, tokensCommand);
    }

    console.log(`Registering ${commands.length} commands:`, commands.map(c => c.name).join(', '));

    const registeredCommands = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('Successfully registered application commands.');
    console.log('Registered commands:', commands.map(c => `/${c.name}`).join(', '));

    // Set permissions for public commands (powder, tip) to allow everyone
    // Get the guild ID for permissions
    const guildId = process.env.GUILD_ID;
    if (guildId && Array.isArray(registeredCommands)) {
      try {
        // Find the @everyone role ID (it's the same as the guild ID)
        const everyoneRoleId = guildId;

        // Commands that should be available to everyone
        const publicCommands = ['powder', 'tip', 'checkin', 'duality'];
        
        for (const cmd of registeredCommands) {
          if (publicCommands.includes(cmd.name)) {
            try {
              // Set permissions to allow @everyone to use the command
              await rest.put(
                Routes.applicationCommandPermissions(process.env.CLIENT_ID, guildId, cmd.id),
                {
                  body: {
                    permissions: [
                      {
                        id: everyoneRoleId,
                        type: 1, // ROLE type
                        permission: true, // Allow
                      },
                    ],
                  },
                }
              );
              console.log(`✅ Set permissions for /${cmd.name} to allow everyone`);
            } catch (permError) {
              console.warn(`⚠️  Could not set permissions for /${cmd.name}:`, permError.message);
              console.warn('   Command will still work, but may have default Discord permissions.');
            }
          }
        }
      } catch (permError) {
        console.warn('⚠️  Could not set command permissions:', permError.message);
        console.warn('   Make sure your bot has "Manage Server" permission.');
      }
    }
  } catch (error) {
    console.error('Error registering commands:', error);
    if (error.response) {
      console.error('Discord API error response:', error.response.data);
    }
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
  console.log('[Duality] Running weekly cycle check...');
  let status = await fetchDualityStatus();
  if (!status || !status.cycle) {
    console.log('[Duality] No active cycle detected.');
    return;
  }

  console.log(`[Duality] Cycle found: status=${status.cycle.status}, trials=${status.trials?.length || 0}, participants=${status.participants?.length || 0}`);

  const updated = await managePairingSessions(status, client);
  if (updated) {
    status = (await fetchDualityStatus()) || status;
  }

  const cycle = status.cycle;
  // Process trials during alignment, active, or trial phases (for testing flexibility)
  if (cycle.status === 'alignment' || cycle.status === 'active' || cycle.status === 'trial') {
    console.log('[Duality] Processing trials...');
    await processTrials(status, client);
  }
  if (cycle.status === 'active') {
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
React with ⚪ to absolve or 🔴 to condemn.`
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
    await message.react('⚪');
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
React in ${channel.toString()} with ⚪ or 🔴 to rally support.`
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
    const absolveReaction = reactions.find((r) => r.emoji.name === '⚪');
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
    .addFields({ name: 'Votes', value: `⚪ ${votesAbsolve}  |  🔴 ${votesCondemn}` })
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
Votes — ⚪ ${votesAbsolve} / 🔴 ${votesCondemn}`
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
    const bothCheckedIn = Boolean(pair.goodCheckinAt && pair.evilCheckinAt);
    const targetStatus = bothCheckedIn ? 'completed' : 'expired';
    const res = await apiFetch(`/api/duality/pairings/${pair.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: targetStatus, cooldownMinutes: cooldown }),
    });

    if (!res.ok) {
      console.error('[Duality] Failed to complete expired pairing:', res.status, res.data);
    } else {
      console.log(
        `[Duality] Pairing ${pair.id} window finished as ${targetStatus}. Released partners with ${cooldown}m cooldown.`,
      );
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
  if (!status || !status.cycle) {
    console.log('[Duality] processTrials: No status or cycle');
    return;
  }
  const trials = ensureArray(status.trials);
  console.log(`[Duality] processTrials: Found ${trials.length} trial(s)`);
  if (!trials.length) return;

  console.log(`[Duality] Trial channel ID: ${DUALITY_TRIAL_CHANNEL_ID || HOLDERS_CHANNEL_ID}`);
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

    console.log(`[Duality] Trial ${trial.id.slice(0, 8)}: status=${trial.status}, scheduledAt=${new Date(scheduledAt).toISOString()}, now=${new Date(now).toISOString()}, shouldStart=${scheduledAt <= now}`);

    if (
      trial.status === 'scheduled' &&
      !Number.isNaN(scheduledAt) &&
      scheduledAt <= now
    ) {
      console.log(`[Duality] Starting trial voting for ${trial.id}`);
      await startTrialVoting(trial, channel, client, metadata);
    } else if (
      trial.status === 'voting' &&
      !Number.isNaN(voteEndsAt) &&
      voteEndsAt <= now
    ) {
      console.log(`[Duality] Finalizing trial voting for ${trial.id}`);
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
      .addFields({
        name: 'How to Complete',
        value:
          'Both holders must run `/duality` (or press the dashboard Duality Check-In button) before the window ends to earn your karma bonus.',
        inline: false,
      })
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

    const checkInReminder =
      '\nUse **/duality** (or the dashboard Duality Check-In button) before the window closes to lock in your reward.';
    const dmMessage = sameAlignmentLabel
      ? `🪞 **Same-Side Duality Pairing Active**\nYou have been paired with another ${
          pair.alignment === 'evil' ? 'Evil' : 'Good'
        } holder.\nYour window ends ${windowEndText}. Coordinate together, then you will enter a ${cooldownText} cooldown.${checkInReminder}`
      : `🔗 **Duality Pairing Active**\nYour window ends ${windowEndText}. Coordinate with your partner and complete your objectives, then you will enter a ${cooldownText} cooldown.${checkInReminder}`;
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
  // DISABLED: Pool sync is now handled by cron job (/api/cron/sync-flashnet-pools)
  // This function no longer makes SDK calls or saves anything
  return;
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

  // Note: Pool sync is now handled by cron job every 5 minutes
  // Fallback sync removed - if pool not found, it will be in next cron run
  // If you need immediate sync for new pools, uncomment below:
  // if (!pool) {
  //   await syncFlashnetPools(true);
  //   pool = await getStoredFlashnetPool(query);
  // }

  if (!pool) {
    await interaction.editReply({
      content: `❌ Pool "${query}" not found in the Flashnet database. Try another identifier or wait for the next sync (cron runs every 5 minutes).`,
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

// Helper function to batch process role operations
async function batchProcessRoleOperations(guild, discordIds, role, operation, operationName) {
  if (!discordIds || discordIds.length === 0) {
    return { success: 0, failed: 0 };
  }

  const BATCH_SIZE = 10; // Process 10 members at a time to respect rate limits
  let successCount = 0;
  let failedCount = 0;

  // Process in batches
  for (let i = 0; i < discordIds.length; i += BATCH_SIZE) {
    const batch = discordIds.slice(i, i + BATCH_SIZE);
    
    // Fetch all members in this batch in parallel
    const memberPromises = batch.map(async (discordId) => {
      try {
        const member = await guild.members.fetch(discordId);
        return { success: true, member, discordId };
      } catch (error) {
        // Skip "Unknown Member" errors (user left server) - this is expected
        if (error.code === 10007) {
          return { success: false, error: null, discordId }; // Silently skip
        }
        return { success: false, error, discordId };
      }
    });

    const memberResults = await Promise.allSettled(memberPromises);
    
    // Process role operations for successfully fetched members
    const roleOperationPromises = memberResults.map(async (result) => {
      if (result.status === 'rejected') {
        failedCount++;
        return;
      }

      const { success, member, error, discordId } = result.value;
      
      if (!success || !member) {
        // Silently skip users who left the server
        return;
      }

      try {
        const needsOperation = operation === 'add' 
          ? !member.roles.cache.has(role.id)
          : member.roles.cache.has(role.id);

        if (needsOperation) {
          if (operation === 'add') {
            await member.roles.add(role);
          } else {
            await member.roles.remove(role);
          }
          successCount++;
          console.log(`✅ ${operation === 'add' ? 'Added' : 'Removed'} ${operationName} role ${operation === 'add' ? 'to' : 'from'} ${member.user.tag} (${discordId})`);
        }
      } catch (error) {
        // Skip "Unknown Member" errors (user left server) - this is expected
        if (error.code === 10007) {
          // Silently skip - user is no longer in the server
          return;
        }
        console.error(`Error ${operation}ing ${operationName} role ${operation === 'add' ? 'to' : 'from'} ${discordId}:`, error);
        failedCount++;
      }
    });

    await Promise.allSettled(roleOperationPromises);
    
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < discordIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return { success: successCount, failed: failedCount };
}

async function syncHolderAndSpecialRoles() {
  try {
    console.log('🔄 Running holder/special role sync...');
    const guild =
      client.guilds.cache.get(process.env.GUILD_ID) ||
      (process.env.GUILD_ID ? await client.guilds.fetch(process.env.GUILD_ID) : null);
    if (!guild) {
      console.error('Guild not found');
      return;
    }

    const holderRole = guild.roles.cache.get(process.env.HOLDER_ROLE_ID);
    if (!holderRole) {
      console.error('Holder role not found');
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz';

    const [removeResponse, addResponse] = await Promise.all([
      fetch(`${baseUrl}/api/discord/roles/list?action=remove`),
      fetch(`${baseUrl}/api/discord/roles/list?action=add`),
    ]);

    if (!removeResponse.ok) {
      console.error('Failed to fetch users to remove roles:', removeResponse.status);
    }

    if (!addResponse.ok) {
      console.error('Failed to fetch users to add roles:', addResponse.status);
    }

    const removeData = removeResponse.ok ? await removeResponse.json() : { discordIds: [] };
    const addData = addResponse.ok ? await addResponse.json() : { discordIds: [] };

    // Process removals and additions in parallel
    const [removeResult, addResult] = await Promise.all([
      batchProcessRoleOperations(guild, removeData.discordIds, holderRole, 'remove', 'holder'),
      batchProcessRoleOperations(guild, addData.discordIds, holderRole, 'add', 'holder'),
    ]);

    console.log(`✅ Holder role sync complete: Removed ${removeResult.success} roles, Added ${addResult.success} roles`);

    if (EXECUTIONER_ROLE_ID) {
      const executionerRole = guild.roles.cache.get(EXECUTIONER_ROLE_ID);
      if (!executionerRole) {
        console.warn(`Executioner role with ID ${EXECUTIONER_ROLE_ID} not found in guild.`);
      } else {
        try {
          const [execAddResponse, execRemoveResponse] = await Promise.all([
            fetch(`${baseUrl}/api/discord/roles/list?action=executioner-add`),
            fetch(`${baseUrl}/api/discord/roles/list?action=executioner-remove`),
          ]);

          if (!execAddResponse.ok) {
            console.error('Failed to fetch executioner add list:', execAddResponse.status);
          }

          if (!execRemoveResponse.ok) {
            console.error('Failed to fetch executioner remove list:', execRemoveResponse.status);
          }

          const execAddData = execAddResponse.ok ? await execAddResponse.json() : { discordIds: [] };
          const execRemoveData = execRemoveResponse.ok ? await execRemoveResponse.json() : { discordIds: [] };

          const [execAddResult, execRemoveResult] = await Promise.all([
            batchProcessRoleOperations(guild, execAddData.discordIds, executionerRole, 'add', 'executioner'),
            batchProcessRoleOperations(guild, execRemoveData.discordIds, executionerRole, 'remove', 'executioner'),
          ]);

          console.log(`✅ Executioner sync complete: Added ${execAddResult.success} roles, Removed ${execRemoveResult.success} roles`);
        } catch (error) {
          console.error('Error syncing executioner roles:', error);
        }
      }
    }

    if (SUMMONER_ROLE_ID) {
      const summonerRole = guild.roles.cache.get(SUMMONER_ROLE_ID);
      if (!summonerRole) {
        console.warn(`Summoner role with ID ${SUMMONER_ROLE_ID} not found in guild.`);
      } else {
        try {
          const [summonerAddResponse, summonerRemoveResponse] = await Promise.all([
            fetch(`${baseUrl}/api/discord/roles/list?action=summoner-add`),
            fetch(`${baseUrl}/api/discord/roles/list?action=summoner-remove`),
          ]);

          if (!summonerAddResponse.ok) {
            console.error('Failed to fetch summoner add list:', summonerAddResponse.status);
          }

          if (!summonerRemoveResponse.ok) {
            console.error('Failed to fetch summoner remove list:', summonerRemoveResponse.status);
          }

          const summonerAddData = summonerAddResponse.ok ? await summonerAddResponse.json() : { discordIds: [] };
          const summonerRemoveData = summonerRemoveResponse.ok ? await summonerRemoveResponse.json() : { discordIds: [] };

          const [summonerAddResult, summonerRemoveResult] = await Promise.all([
            batchProcessRoleOperations(guild, summonerAddData.discordIds, summonerRole, 'add', 'summoner'),
            batchProcessRoleOperations(guild, summonerRemoveData.discordIds, summonerRole, 'remove', 'summoner'),
          ]);

          console.log(`✅ Summoner sync complete: Added ${summonerAddResult.success} roles, Removed ${summonerRemoveResult.success} roles`);
              } catch (error) {
          console.error('Error syncing summoner roles:', error);
              }
            }
          }

    if (DEAD_DEMON_ROLE_ID) {
      const deadDemonRole = guild.roles.cache.get(DEAD_DEMON_ROLE_ID);
      if (!deadDemonRole) {
        console.warn(`Dead Demon role with ID ${DEAD_DEMON_ROLE_ID} not found in guild.`);
      } else {
              try {
          const [deadDemonAddResponse, deadDemonRemoveResponse] = await Promise.all([
            fetch(`${baseUrl}/api/discord/roles/list?action=dead-demon-add`),
            fetch(`${baseUrl}/api/discord/roles/list?action=dead-demon-remove`),
          ]);

          if (!deadDemonAddResponse.ok) {
            console.error('Failed to fetch dead demon add list:', deadDemonAddResponse.status);
          }

          if (!deadDemonRemoveResponse.ok) {
            console.error('Failed to fetch dead demon remove list:', deadDemonRemoveResponse.status);
          }

          const deadDemonAddData = deadDemonAddResponse.ok ? await deadDemonAddResponse.json() : { discordIds: [] };
          const deadDemonRemoveData = deadDemonRemoveResponse.ok ? await deadDemonRemoveResponse.json() : { discordIds: [] };

          const [deadDemonAddResult, deadDemonRemoveResult] = await Promise.all([
            batchProcessRoleOperations(guild, deadDemonAddData.discordIds, deadDemonRole, 'add', 'dead demon'),
            batchProcessRoleOperations(guild, deadDemonRemoveData.discordIds, deadDemonRole, 'remove', 'dead demon'),
          ]);

          console.log(`✅ Dead Demon sync complete: Added ${deadDemonAddResult.success} roles, Removed ${deadDemonRemoveResult.success} roles`);
        } catch (error) {
          console.error('Error syncing dead demon roles:', error);
        }
      }
    }

    if (GRAVE_ROBBER_ROLE_ID) {
      const graveRobberRole = guild.roles.cache.get(GRAVE_ROBBER_ROLE_ID);
      if (!graveRobberRole) {
        console.warn(`Grave Robber role with ID ${GRAVE_ROBBER_ROLE_ID} not found in guild.`);
      } else {
        try {
          const [graveRobberAddResponse, graveRobberRemoveResponse] = await Promise.all([
            fetch(`${baseUrl}/api/discord/roles/list?action=grave-robber-add`),
            fetch(`${baseUrl}/api/discord/roles/list?action=grave-robber-remove`),
          ]);

          if (!graveRobberAddResponse.ok) {
            console.error('Failed to fetch grave robber add list:', graveRobberAddResponse.status);
          }

          if (!graveRobberRemoveResponse.ok) {
            console.error('Failed to fetch grave robber remove list:', graveRobberRemoveResponse.status);
          }

          const graveRobberAddData = graveRobberAddResponse.ok ? await graveRobberAddResponse.json() : { discordIds: [] };
          const graveRobberRemoveData = graveRobberRemoveResponse.ok ? await graveRobberRemoveResponse.json() : { discordIds: [] };

          const [graveRobberAddResult, graveRobberRemoveResult] = await Promise.all([
            batchProcessRoleOperations(guild, graveRobberAddData.discordIds, graveRobberRole, 'add', 'grave robber'),
            batchProcessRoleOperations(guild, graveRobberRemoveData.discordIds, graveRobberRole, 'remove', 'grave robber'),
          ]);

          console.log(`✅ Grave Robber sync complete: Added ${graveRobberAddResult.success} roles, Removed ${graveRobberRemoveResult.success} roles`);
        } catch (error) {
          console.error('Error syncing grave robber roles:', error);
        }
      }
    }

    if (HORDE_SLAYER_ROLE_ID) {
      const hordeSlayerRole = guild.roles.cache.get(HORDE_SLAYER_ROLE_ID);
      if (!hordeSlayerRole) {
        console.warn(`Horde Slayer role with ID ${HORDE_SLAYER_ROLE_ID} not found in guild.`);
      } else {
        try {
          // Horde slayer role is permanent - only add, never remove
          const hordeSlayerAddResponse = await fetch(`${baseUrl}/api/discord/roles/list?action=horde-slayer-add`);

          if (!hordeSlayerAddResponse.ok) {
            console.error('Failed to fetch horde slayer add list:', hordeSlayerAddResponse.status);
          }

          const hordeSlayerAddData = hordeSlayerAddResponse.ok ? await hordeSlayerAddResponse.json() : { discordIds: [] };

          const hordeSlayerAddResult = await batchProcessRoleOperations(guild, hordeSlayerAddData.discordIds, hordeSlayerRole, 'add', 'horde slayer');

          console.log(`✅ Horde Slayer sync complete: Added ${hordeSlayerAddResult.success} roles (permanent role - no removals)`);
        } catch (error) {
          console.error('Error syncing horde slayer roles:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error in holder/special role sync:', error);
  }
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
  // DISABLED: Pool sync is now handled by cron job (/api/cron/sync-flashnet-pools)
  // This function no longer makes SDK calls or saves anything
  return;
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

  // Note: Pool sync is now handled by cron job every 5 minutes
  // Fallback sync removed - if pool not found, it will be in next cron run
  // If you need immediate sync for new pools, uncomment below:
  // if (!pool) {
  //   await syncFlashnetPools(true);
  //   pool = await getStoredFlashnetPool(query);
  // }

  if (!pool) {
    await interaction.editReply({
      content: `❌ Pool "${query}" not found in the Flashnet database. Try another identifier or wait for the next sync (cron runs every 5 minutes).`,
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

  if (interaction.commandName === 'duality') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const res = await apiFetch('/api/duality/pairings/checkin', {
        method: 'POST',
        body: JSON.stringify({ discordUserId: interaction.user.id }),
      });

      if (!res.ok) {
        const errorMessage =
          res.data?.error ||
          res.data?.message ||
          'Unable to record Duality check-in. Make sure you have an active pairing window.';
        await interaction.editReply({
          content: `❌ **Duality Check-In Failed**\n\n${errorMessage}`,
        });
        return;
      }

      const payload = res.data || {};
      const pair = payload.pair;
      let message = '';

      if (payload.alreadyCheckedIn) {
        message = '✅ You already checked in for the current Duality window.';
      } else if (payload.bothCheckedIn) {
        message = `✅ Both check-ins recorded! Cooldown has begun.${
          pair?.cooldownMinutes
            ? ` Your cooldown lasts ${pair.cooldownMinutes} minutes.`
            : ''
        }`;
      } else {
        const partnerStatus = pair?.goodCheckinAt && pair?.evilCheckinAt
          ? ''
          : '\n\nPing your partner to check in before the window closes!';
        message = `✅ Check-in recorded.${partnerStatus}`;
      }

      if (pair?.windowEnd) {
        const windowEndTs = Math.floor(new Date(pair.windowEnd).getTime() / 1000);
        message += `\nWindow closes <t:${windowEndTs}:R>.`;
      }

      await interaction.editReply({
        content: message,
      });
    } catch (error) {
      console.error('[Duality] Discord check-in command error:', error);
      await interaction.editReply({
        content:
          '❌ **Error**\n\nUnable to process your Duality check-in right now. Please try again in a moment.',
      });
    }
    return;
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
          // Skip "Unknown Member" errors (user left server) - this is expected
          if (error.code === 10007) {
            // Silently skip - user is no longer in the server
            continue;
          }
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
    return;
  }

  // Handle tip command
  if (interaction.commandName === 'tip') {
    await interaction.deferReply({ ephemeral: false }); // Public reply so recipient can see
    
    try {
      const recipientUser = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);

      if (!recipientUser) {
        await interaction.editReply({
          content: '❌ **Error**\n\nPlease specify a valid user to tip.',
        });
        return;
      }

      if (amount <= 0) {
        await interaction.editReply({
          content: '❌ **Error**\n\nTip amount must be greater than 0.',
        });
        return;
      }

      if (recipientUser.id === interaction.user.id) {
        await interaction.editReply({
          content: '❌ **Error**\n\nYou cannot tip yourself.',
        });
        return;
      }

      const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/discord/tip`;
      console.log(`[Tip] Processing tip from ${interaction.user.id} to ${recipientUser.id} for ${amount} powder`);
      console.log(`[Tip] API URL: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderDiscordId: interaction.user.id,
          recipientDiscordId: recipientUser.id,
          amount: amount,
        }),
      });

      console.log(`[Tip] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorData;
        let errorText = '';
        try {
          errorText = await response.text();
          console.log(`[Tip] Error response body: ${errorText}`);
          errorData = errorText ? JSON.parse(errorText) : { error: 'Unknown error' };
        } catch (parseError) {
          console.error('[Tip] Failed to parse error response:', parseError);
          console.error('[Tip] Raw error text:', errorText);
          errorData = { error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` };
        }
        
        const errorMessage = errorData.error || `Failed to process tip: ${response.status}`;
        console.error(`[Tip] Tip failed: ${errorMessage}`);
        
        await interaction.editReply({
          content: `❌ **Tip Failed**\n\n${errorMessage}`,
        });
        return;
      }

      let data;
      try {
        const responseText = await response.text();
        console.log(`[Tip] Response body: ${responseText}`);
        data = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('[Tip] Failed to parse success response:', parseError);
        await interaction.editReply({
          content: `❌ **Tip Failed**\n\nReceived invalid response from server. Please try again.`,
        });
        return;
      }

      console.log(`[Tip] Response data:`, JSON.stringify(data));

      if (data.success) {
        const embed = new EmbedBuilder()
          .setTitle('💎 Tip Successful!')
          .setDescription(
            `<@${interaction.user.id}> tipped **${amount} ascension powder** to <@${recipientUser.id}>!`
          )
          .addFields(
            {
              name: 'Sender Balance',
              value: `${data.sender?.powderAfter?.toLocaleString() || '0'} powder`,
              inline: true,
            },
            {
              name: 'Recipient Balance',
              value: `${data.recipient?.powderAfter?.toLocaleString() || '0'} powder`,
              inline: true,
            }
          )
          .setColor(0x2ecc71)
          .setTimestamp(new Date());

        await interaction.editReply({
          content: `<@${recipientUser.id}>`,
          embeds: [embed],
        });
        console.log(`[Tip] Tip successful: ${amount} powder transferred`);
      } else {
        const errorMessage = data.error || 'Unknown error occurred';
        console.error(`[Tip] Tip failed (success=false): ${errorMessage}`);
        await interaction.editReply({
          content: `❌ **Tip Failed**\n\n${errorMessage}`,
        });
      }
    } catch (error) {
      console.error('[Tip] Error during tip:', error);
      console.error('[Tip] Error stack:', error.stack);
      console.error('[Tip] Error message:', error.message);
      await interaction.editReply({
        content: `❌ **Error**\n\nAn error occurred while processing the tip: ${error.message || 'Unknown error'}\n\nPlease try again or contact support if the issue persists.`,
      });
    }
    return;
  }

  // Handle powder command
  if (interaction.commandName === 'powder') {
    await interaction.deferReply({ ephemeral: true });
    
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://thedamned.xyz'}/api/discord/balance?discordUserId=${encodeURIComponent(interaction.user.id)}`;
      console.log(`[Powder] Fetching balance for Discord user ${interaction.user.id} from ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`[Powder] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorData;
        try {
          const text = await response.text();
          console.log(`[Powder] Error response body: ${text}`);
          errorData = text ? JSON.parse(text) : { error: 'Unknown error' };
        } catch (parseError) {
          console.error('[Powder] Failed to parse error response:', parseError);
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        await interaction.editReply({
          content: `❌ **Error**\n\n${errorData.error || `Failed to fetch balance: ${response.status}`}`,
        });
        return;
      }

      const data = await response.json();
      console.log(`[Powder] Response data:`, JSON.stringify(data));

      if (data.success) {
        const embed = new EmbedBuilder()
          .setTitle('💎 Ascension Powder Balance')
          .setDescription(`You have **${data.balance.toLocaleString()}** ascension powder`)
          .addFields(
            {
              name: 'Wallet',
              value: `\`${data.wallet ? `${data.wallet.slice(0, 6)}...${data.wallet.slice(-4)}` : 'N/A'}\``,
              inline: true,
            },
            {
              name: 'Balance',
              value: `${data.balance.toLocaleString()} powder`,
              inline: true,
            }
          )
          .setColor(0x9b59b6)
          .setTimestamp(new Date());

        await interaction.editReply({
          embeds: [embed],
        });
      } else {
        await interaction.editReply({
          content: `❌ **Error**\n\n${data.error || 'Failed to fetch balance'}\n\n${data.balance !== undefined ? `Your balance: ${data.balance}` : ''}`,
        });
      }
    } catch (error) {
      console.error('[Powder] Error fetching balance:', error);
      console.error('[Powder] Error stack:', error.stack);
      await interaction.editReply({
        content: `❌ **Error**\n\nAn error occurred while fetching your balance: ${error.message || 'Unknown error'}`,
      });
    }
    return;
  }

  // Handle damnedrumble command
  if (interaction.commandName === 'damnedrumble') {
    // Check if user has the required role
    const member = interaction.member;
    if (!member.roles.cache.has(RUMBLE_ADMIN_ROLE_ID)) {
      await interaction.reply({
        content: '❌ You do not have permission to start a Damned Rumble!',
        ephemeral: true,
      });
      return;
    }

    // Check if there's already an active rumble in this channel
    if (activeRumbles.has(interaction.channelId)) {
      await interaction.reply({
        content: '⚠️ A Damned Rumble is already in progress in this channel!',
        ephemeral: true,
      });
      return;
    }

    // Start the rumble
    await interaction.reply({
      content: `# ⚔️ DAMNED RUMBLE ⚔️\n\n🔥 A battle royale is about to begin! 🔥\n\nReact with ⚔️ to enter the arena!\n\n⏱️ **60 seconds** until the gates close...`,
    });

    const message = await interaction.fetchReply();
    await message.react('⚔️');

    const rumbleData = {
      messageId: message.id,
      channelId: interaction.channelId,
      players: new Set(),
      startTime: Date.now(),
    };
    activeRumbles.set(interaction.channelId, rumbleData);

    // Countdown messages
    const countdowns = [
      { delay: 30000, message: '⏱️ **30 seconds** remaining to join the Damned Rumble!' },
      { delay: 45000, message: '⏱️ **15 seconds** remaining! Last chance to enter!' },
      { delay: 55000, message: '⏱️ **5 seconds**... 🔥' },
    ];

    for (const countdown of countdowns) {
      setTimeout(async () => {
        if (activeRumbles.has(interaction.channelId)) {
          await interaction.channel.send(countdown.message);
        }
      }, countdown.delay);
    }

    // Start the game after 60 seconds
    setTimeout(async () => {
      await runDamnedRumble(interaction.channel, rumbleData);
    }, 60000);

    return;
  }
});

// Damned Rumble game logic
async function runDamnedRumble(channel, rumbleData) {
  try {
    // Fetch the message to get reactions
    const message = await channel.messages.fetch(rumbleData.messageId);
    const reaction = message.reactions.cache.get('⚔️');
    
    // Get all users who reacted
    const users = await reaction.users.fetch();
    const players = users.filter(u => !u.bot).map(u => ({ id: u.id, name: u.username, alive: true }));

    // Clean up active rumble
    activeRumbles.delete(channel.id);

    if (players.length < 2) {
      await channel.send('❌ **RUMBLE CANCELLED**\n\nNot enough warriors entered the arena! Need at least 2 players.');
      return;
    }

    // Announce players
    const playerList = players.map(p => `• <@${p.id}>`).join('\n');
    await channel.send(`# ⚔️ THE RUMBLE BEGINS! ⚔️\n\n**${players.length} warriors have entered the arena:**\n${playerList}\n\n🩸 *Let the carnage begin...* 🩸`);

    await sleep(3000);

    let round = 1;
    let alivePlayers = players.filter(p => p.alive);

    // Combine all death messages
    const allDeathMessages = [...RUMBLE_DEATH_MESSAGES, ...RUMBLE_DEATH_MESSAGES_EXTENDED];

    // Game loop
    while (alivePlayers.length > 1) {
      await channel.send(`\n## 💀 ROUND ${round} 💀`);
      await sleep(2000);

      // 1% chance: CHAOS EVENT - Everyone dies except one random survivor
      if (Math.random() < 0.01 && alivePlayers.length > 2) {
        const luckyIndex = Math.floor(Math.random() * alivePlayers.length);
        const luckySurvivor = alivePlayers[luckyIndex];
        
        // Kill everyone except the lucky one
        for (const player of alivePlayers) {
          if (player !== luckySurvivor) {
            player.alive = false;
          }
        }
        
        const massacreMsg = RUMBLE_CHAOS_MASSACRE[Math.floor(Math.random() * RUMBLE_CHAOS_MASSACRE.length)];
        await channel.send(massacreMsg(luckySurvivor.name));
        await sleep(3000);
        
        alivePlayers = players.filter(p => p.alive);
        round++;
        continue;
      }

      // 2% chance: CHAOS EVENT - All dead players resurrect!
      const deadPlayers = players.filter(p => !p.alive);
      if (Math.random() < 0.02 && deadPlayers.length > 0) {
        for (const dead of deadPlayers) {
          dead.alive = true;
        }
        
        const resMsg = RUMBLE_CHAOS_RESURRECTION[Math.floor(Math.random() * RUMBLE_CHAOS_RESURRECTION.length)];
        await channel.send(resMsg);
        await sleep(3000);
        
        alivePlayers = players.filter(p => p.alive);
        await channel.send(`\n📊 **${alivePlayers.length} warriors now in the arena!**`);
        await sleep(2000);
      }

      const events = [];
      const roundKills = Math.min(
        Math.floor(Math.random() * 4) + 2, // 2-5 kills per round
        alivePlayers.length - 1 // Can't kill everyone
      );

      // Select random killers and victims
      const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
      const killers = shuffled.slice(0, Math.min(roundKills, Math.floor(shuffled.length / 2)));
      const potentialVictims = shuffled.filter(p => !killers.includes(p));

      let killCount = 0;
      for (const killer of killers) {
        if (potentialVictims.length === 0 || killCount >= roundKills) break;
        if (alivePlayers.filter(p => p.alive).length <= 1) break;

        // 70% chance to successfully kill, 30% chance to miss
        if (Math.random() < 0.7) {
          const victimIndex = Math.floor(Math.random() * potentialVictims.length);
          const victim = potentialVictims[victimIndex];
          
          if (victim && victim.alive) {
            victim.alive = false;
            potentialVictims.splice(victimIndex, 1);
            
            const deathMsg = allDeathMessages[Math.floor(Math.random() * allDeathMessages.length)];
            events.push(deathMsg(killer.name, victim.name));
            killCount++;
          }
        } else {
          // Miss message
          const surviveMsg = RUMBLE_SURVIVE_MESSAGES[Math.floor(Math.random() * RUMBLE_SURVIVE_MESSAGES.length)];
          const randomAlive = alivePlayers.filter(p => p.alive)[Math.floor(Math.random() * alivePlayers.filter(p => p.alive).length)];
          if (randomAlive) {
            events.push(surviveMsg(randomAlive.name));
          }
        }
      }

      // Random survival events for remaining alive players
      const survivors = alivePlayers.filter(p => p.alive);
      for (const survivor of survivors) {
        if (Math.random() < 0.3) { // 30% chance for a random action message
          const randomAction = RUMBLE_RANDOM_ACTIONS[Math.floor(Math.random() * RUMBLE_RANDOM_ACTIONS.length)];
          events.push(randomAction(survivor.name));
        }
      }

      // Send events in batches
      for (let i = 0; i < events.length; i++) {
        await channel.send(events[i]);
        await sleep(1500);
      }

      // Update alive players
      alivePlayers = players.filter(p => p.alive);

      // Round summary
      if (alivePlayers.length > 1) {
        await channel.send(`\n📊 **${alivePlayers.length} warriors remain...**`);
        await sleep(3000);
      }

      round++;

      // Safety check to prevent infinite loops
      if (round > 50) {
        await channel.send('⚠️ The gods have ended this battle prematurely!');
        break;
      }
    }

    // Announce winner
    const winner = alivePlayers[0];
    if (winner) {
      await sleep(2000);
      await channel.send(`\n# 🏆 VICTORY! 🏆\n\n<@${winner.id}> **${winner.name}** is the last one standing!\n\n👑 *All hail the champion of the Damned Rumble!* 👑\n\n🩸 ${players.length - 1} souls were claimed. 🩸`);
    } else {
      await channel.send('\n# 💀 MUTUAL DESTRUCTION 💀\n\nAll warriors have fallen. There is no victor today...');
    }

  } catch (error) {
    console.error('[DamnedRumble] Error:', error);
    activeRumbles.delete(channel.id);
    await channel.send('❌ An error occurred during the Damned Rumble!');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Periodic job to check holders and manage roles (runs every hour)
// Note: Pool sync is now handled by cron job (/api/cron/sync-flashnet-pools) every 5 minutes
// Removed redundant periodic sync here

setInterval(() => {
  void syncHolderAndSpecialRoles();
}, 3600000);

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
  console.log(`Guild ID: ${process.env.GUILD_ID}`);
  console.log(`Client ID: ${process.env.CLIENT_ID}`);
  console.log(`Holder Role ID: ${process.env.HOLDER_ROLE_ID}`);
  await registerCommands();
  // Note: Pool sync is now handled by cron job (/api/cron/sync-flashnet-pools) every 5 minutes
  // Removed startup sync - cron will handle it
  await handleDualityWeeklyCycle(client);
  await syncHolderAndSpecialRoles();
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
