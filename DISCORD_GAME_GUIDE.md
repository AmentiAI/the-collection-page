# 🎮 The Damned - Complete Game Guide

## 📋 Table of Contents
1. [Abyss](#abyss)
2. [Crystallization Chamber](#crystallization-chamber)
3. [Battle Arena](#battle-arena)
4. [Battlefield (Redemption Map)](#battlefield-redemption-map)
5. [Pool of Life](#pool-of-life)
6. [Tree of Ascension](#tree-of-ascension)
7. [The Horde](#the-horde)
8. [Leaderboard](#leaderboard)
9. [Graveyard](#graveyard)
10. [Abyss Summon](#abyss-summon)
11. [Resurrection Chamber](#resurrection-chamber)

---

## 🔥 Abyss
**URL:** `/abyss`

**What it does:**
- The main sacrifice mechanic where you burn your Damned ordinals
- Each burn grants you ascension powder and adds the ordinal to your graveyard
- Currently **DISABLED** (cap reached at 500 burns)
- Can be temporarily opened via "burn windows" for bonus credit holders

**How it works:**
1. Select a Damned ordinal to sacrifice
2. Select a payment wallet/address
3. Sign the transaction to burn the ordinal
4. Receive ascension powder (amount varies by source)
5. Burned ordinal appears in your graveyard

**Special Features:**
- **Bonus Burn Credits:** Complete portal circles to earn bonus burn credits that let you burn even when the abyss is full
- **Burn Windows:** Temporary openings (usually 30min-1hr) after completing portal circles
- **Cooldown:** 15 minutes between burns

**Requirements:**
- Must be a holder (have at least one unlisted Damned ordinal)
- Wallet must be connected

---

## 💎 Crystallization Chamber
**URL:** `/crystallizationz`

**What it does:**
- Passive ascension powder generation system
- Place your ordinals in the chamber to earn powder over time

**How it works:**
1. Select ordinals from your army (must have life force > 0)
2. Click "Enter Crystallization" to place them in the chamber
3. Each ordinal earns **+1 ascension powder every 30 minutes**
4. Click "Claim" to collect all earned powder
5. Powder is added to your profile's total

**Important Notes:**
- Ordinals in crystallization **cannot** be readied for battle
- You must "Exit Crystallization" before using them in battle
- Powder accumulates based on time spent in chamber
- Daily history tracks your earnings

 
---

## ⚔️ Battle Arena
**URL:** `/battlez`

**What it does:**
- Prepare your ordinals for battle against the horde
- Set ordinals to "Ready" or "Sanctuary" status
- Apply reward items (block chance bonuses, life force cap bonuses)
- View your army's stats (life force, block chance, HP cap)

**How it works:**
1. View all your ordinals (Angelic and Demonic)
2. **Ready Status:** Ordinal can be attacked by the horde
3. **Sanctuary Status:** Ordinal is protected from attacks
4. Apply dungeon crawl reward items to boost stats
5. View current block chance and life force caps

**Reward Items:**
- **Block Chance Bonus:** Increases your block chance (base 10% + bonus)
- **Life Force Cap Bonus:** Increases your maximum life force
- Items are earned from completing dungeon crawls
- Items can be applied to specific ordinals

**Important:**
- Dead ordinals (0 life force) show "Dead" button and link to resurrection
- Ordinals in crystallization cannot be readied until they exit
- Visual indicators show which ordinals have item bonuses

 
---

## 🗺️ Battlefield (Redemption Map)
**URL:** `/battlefield`

**What it does:**
- Interactive map showing battle locations and territories
- Visual representation of the war between Angelic and Demonic forces
- Shows where battles have occurred and current battle status

**How it works:**
1. View the map (no wallet connection required for viewing)
2. See territories controlled by each side
3. Track battle locations and outcomes
4. Monitor the ongoing war

**Note:** This is primarily a visualization/map page showing the state of the war.

---

## 💚 Pool of Life
**URL:** `/pooloflife`

**What it does:**
- Heal your armies that have taken damage in battle
- Restore life force to your ordinals
- Track healing history

**How it works:**
1. View all your armies with their current life force
2. Select individual armies to heal OR use "Heal All"
3. **Cooldown:** 5 hours between heals
4. Each heal restores life force (amount varies)
5. View your healing history

**Important:**
- **Cannot heal dead armies** (0 life force) - use Resurrection Chamber instead
- Dead armies are automatically hidden from the list
- Cooldown timer shows when you can heal again
- History log tracks all your healing sessions

 
---

## 🌳 Tree of Ascension
**URL:** `/treeofascension`

**What it does:**
- View and mint your ascended images
- Manage images that are awaiting minting
- Regenerate images (if you have regeneration credits)

**How it works:**
1. View all images in your mint queue
2. See mint status for each image:
   - ⏳ Pending Signature
   - 📡 Commit Broadcasting
   - ⚡ Commit in Mempool
   - 🚀 Reveal Broadcasting
   - ✅ Minted!
   - ❌ Failed
3. Click "Mint" button to start the minting process
4. **Regenerate:** Use regeneration credits to generate new versions of images

**Regeneration:**
- Earn regeneration credits by completing portal circles
- Regenerate button appears on images that haven't started minting
- Choose between original and regenerated version
- Credit is consumed when you generate (even if you keep original)

**Image Features:**
- Shows Silver and Glow traits
- Displays compressed file size (KB)
- Auto-compresses images to reduce size
 
---

## 👹 The Horde
**URL:** `/horde`

**What it does:**
- View all members of the horde that attack armies
- See horde stats, images, and battle history
- Public page (no wallet required)

**How it works:**
1. View the list of the horde
2. See each member's:
   - Name and image
   - Total fights/battles
   - Last update time
3. The horde attacks all ready armies every hour automatically

**Note:** This is a view-only page showing the horde. The actual attacks happen automatically via cron job.

---

## 🏆 Leaderboard
**URL:** `/leaderboard`

**What it does:**
- Track Angelic vs Demonic war statistics
- See total battles, deaths, and resurrections for each side
- View overall war score

**How it works:**
1. View the leaderboard (public, no wallet required)
2. See statistics for:
   - **Total Battles:** Number of times armies fought
   - **Total Deaths:** Number of armies that died (life force reached 0)
   - **Total Resurrections:** Number of armies brought back to life
   - **Score:** Calculated from battles and outcomes

**Statistics:**
- Updated from horde attack logs
- Tracks both Angelic and Demonic sides
- Shows which side is winning the war

---

## ⚰️ Graveyard
**URL:** `/graveyard`

**What it does:**
- View all your sacrificed ordinals
- Channel ascension powder to ascend ordinals
- Access ascended images for minting
- Claim chest rewards (300 powder)

**How it works:**
1. View all your burned ordinals (from abyss and summons)
2. **Ascension Powder:**
   - Use powder to ascend ordinals (500 powder for first ascension, 1000 for second)
   - Powder comes from burns, chests, and other sources
3. **Ascension Process:**
   - First ascension: Burn ordinal → Ascend with 500 powder → Image goes to limbo
   - Second ascension: Burn another ordinal → Ascend with 1000 powder → New image
4. **Chest:** Click the chest icon to claim 300 ascension powder (one-time per wallet)
5. **Grave Robbing:** Eligible graves (7+ days old) can be robbed by others

**Limbo:**
- When you ascend, the image goes to "limbo"
- Choose to save for mint OR throw back in abyss
- Second ascension requires burning another ordinal
 
---

## 🔮 Abyss Summon
**URL:** `/abyss-summon`

**What it does:**
- Create or join portal circles (summoning circles)
- Complete circles to earn rewards
- Multiple modes: Portal Circles (40-man), Powder Circles (10-man), Dead Demons (10-man)

**How it works:**
1. **Create a Circle:**
   - Select an ordinal to be the host
   - Choose circle type (Portal/Powder/Dead Demons)
   - Wait for participants to join
2. **Join a Circle:**
   - Browse active circles
   - Select your ordinals to join
   - Wait for circle to fill
3. **Complete Circle:**
   - Host completes when all participants are ready
   - **Rewards:**
     - **Portal Circles (40-man):** Burn window (1 hour) + bonus burn credit to host
     - **Regular Circles:** +1 bonus burn credit to all participants
     - **Powder Circles:** Ascension powder to all participants
4. **Completion Window:**
   - Portal circles have a 3-minute completion window
   - Participants must mark themselves as "completed" during this window

**Circle Types:**
- **Portal Circles (40-man):** Opens abyss for 1 hour, grants bonus credit to host
- **Powder Circles (10-man):** Grants ascension powder to all
- **Dead Demons (10-man):** Special mode for dead demon ordinals

**Timing:**
- Opens for 1 hour every 6 hours (UTC: 05:00, 11:00, 17:00, 23:00)
- Can be overridden by global start time setting

 
---

## 💀 Resurrection Chamber
**URL:** `/resurrect`

**What it does:**
- Bring dead armies (0 life force) back to life
- Restore ordinals that died in battle

**How it works:**
1. View all your dead armies (life force = 0)
2. See resurrection timer for each dead army
3. **Resurrection Time:** 1 hour after death
4. Click "Resurrect" when timer expires
5. Army is restored to full life force
6. View resurrection history

**Important:**
- Dead armies cannot join dungeon crawls
- Dead armies cannot be healed at Pool of Life
- Must wait 1 hour after death before resurrecting
- Resurrection history tracks all resurrections

---

## 🎯 Quick Reference

### Resource Types:
- **Ascension Powder:** Used to ascend ordinals in graveyard
- **Bonus Burn Credits:** Allow burning when abyss is full
- **Regeneration Credits:** Used to regenerate images in Tree of Ascension
- **Life Force:** Health stat for armies (0 = dead)

### Status Types:
- **Ready:** Ordinal can be attacked by the horde
- **Sanctuary:** Ordinal is protected from attacks
- **Dead:** Life force = 0, must resurrect
- **In Crystallization:** Earning powder, cannot battle

### Cooldowns:
- **Abyss Burns:** 15 minutes
- **Pool of Life:** 5 hours
- **Resurrection:** 1 hour after death
- **Crystallization:** None (passive earning)

### Rewards:
- **Dungeon Crawls:** Block chance bonuses, life force cap bonuses
- **Portal Circles:** Bonus burn credits, burn windows
- **Powder Circles:** Ascension powder
- **Graveyard Chest:** 300 ascension powder (one-time)


## ⚠️ Important Notes

1. **Global Start Time:** Some pages may be locked until a global start time passes (set by admin)
2. **Holder Requirement:** Some pages require you to be a holder (have unlisted Damned ordinals)
3. **Dead Armies:** Cannot participate in battles, dungeon crawls, or be healed
4. **Crystallization:** Ordinals in crystallization cannot be readied for battle
5. **Abyss Status:** Currently disabled (cap reached), but can be opened via burn windows

---

*Last Updated: Based on current codebase structure*

