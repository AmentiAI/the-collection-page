# Mega Monster Battle System

## Overview
This system implements a comprehensive battle system where mega monsters attack armies every hour, armies can be healed at the Pool of Life (once per day), dead armies can be resurrected (with a 1-hour lock), and all battle statistics are tracked.

## Database Setup

### 1. Run Migrations

Execute the following migration scripts in order:

```bash
# Add battle stats to profiles table
node scripts/run-add-battle-stats-migration.js

# Add death/resurrection tracking to battle_ordinals table
node scripts/run-add-death-resurrection-migration.js
```

### 2. Database Schema Changes

#### Profiles Table
- `battles_won` (INTEGER, default 0) - Total battles won
- `battles_lost` (INTEGER, default 0) - Total battles lost
- `resurrections` (INTEGER, default 0) - Total resurrections performed

#### Battle Ordinals Table
- `is_dead` (BOOLEAN, default false) - Whether the army is dead
- `death_time` (TIMESTAMPTZ) - When the army died
- `resurrection_time` (TIMESTAMPTZ) - When resurrection will complete
- `last_heal_time` (TIMESTAMPTZ) - Last time healed at Pool of Life

## Features

### 1. Mega Monster Attacks (Cron Job)
- **Endpoint**: `/api/cron/mega-monster-attack`
- **Schedule**: Every hour (configured in `vercel.json`)
- **Functionality**:
  - Gets all active mega monsters
  - Attacks all armies with status='ready' and is_dead=false
  - Base damage: 10 per mega monster
  - **Balanced Army Bonus**: If a wallet has equal numbers of Angelic and Demonic ordinals, damage is reduced by 50%
  - If life_force hits 0, army is marked as dead

### 2. Pool of Life (`/pooloflife`)
- **Healing**: Restores all armies to 100 life_force
- **Limitation**: Can only be used once per 24 hours
- **Features**:
  - Shows all armies and their current health
  - Displays time until next heal is available
  - Visual health bars for each army

### 3. Resurrection Chamber (`/resurrect`)
- **Process**:
  1. Dead armies appear in the resurrection chamber
  2. User must start resurrection (locks army for 1 hour)
  3. After 1 hour, user can complete resurrection
  4. Army is restored to 100 life_force and status='ready'
- **Tracking**: Resurrections are tracked in profiles table

### 4. Battle Statistics
- **Endpoints**:
  - `POST /api/battle/record-win` - Record a battle win
  - `POST /api/battle/record-loss` - Record a battle loss
- **Usage**: Call these endpoints when battles are won/lost in your battle system
- **Tracking**: All stats are stored in profiles table per wallet address

## API Endpoints

### Mega Monster Attack (Cron)
```
GET /api/cron/mega-monster-attack
Authorization: Bearer <CRON_SECRET>
```

### Pool of Life
```
GET /api/pooloflife/status?walletAddress=<address>
POST /api/pooloflife/heal
Body: { walletAddress: string }
```

### Resurrection
```
GET /api/resurrect/dead-armies?walletAddress=<address>
POST /api/resurrect/start
Body: { walletAddress: string, inscriptionId: string }
POST /api/resurrect/resurrect
Body: { walletAddress: string, inscriptionId: string }
```

### Battle Stats
```
POST /api/battle/record-win
Body: { walletAddress: string }

POST /api/battle/record-loss
Body: { walletAddress: string }

POST /api/profile/increment-resurrections
Body: { walletAddress: string }
```

## Vercel Cron Configuration

The cron job is configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/mega-monster-attack",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Note**: Make sure to set `CRON_SECRET` environment variable in Vercel for security.

## Environment Variables

Add to your `.env.local`:
```
CRON_SECRET=your-secret-key-here
NEXT_PUBLIC_BASE_URL=https://your-domain.com (optional, for production)
```

## Usage Flow

1. **Armies enter battle** (`/battle` page)
   - Set status to 'ready'
   - Life force starts at 100

2. **Mega monsters attack** (every hour)
   - Damage is calculated based on mega monster count
   - Balanced armies (equal angels/demons) take 50% less damage
   - If life_force reaches 0, army dies

3. **Healing** (`/pooloflife`)
   - User can heal all armies once per 24 hours
   - Restores all armies to 100 life_force

4. **Death and Resurrection** (`/resurrect`)
   - Dead armies appear in resurrection chamber
   - User starts resurrection (1-hour lock)
   - After 1 hour, user completes resurrection
   - Army is restored and ready for battle

5. **Battle Tracking**
   - When battles are won/lost, call the respective API endpoints
   - Stats are automatically tracked in profiles table

## Testing

### Manual Cron Test
```bash
curl -X GET "http://localhost:3000/api/cron/mega-monster-attack" \
  -H "Authorization: Bearer your-cron-secret"
```

### Test Healing
1. Connect wallet on `/pooloflife`
2. Click "Heal All Armies"
3. Verify armies are restored to 100 life_force
4. Try to heal again (should be blocked for 24 hours)

### Test Resurrection
1. Let an army die (life_force = 0)
2. Go to `/resurrect`
3. Start resurrection
4. Wait 1 hour (or manually update database for testing)
5. Complete resurrection
6. Verify army is ready for battle

## Notes

- The balanced army bonus requires fetching trait information from Magic Eden API
- Resurrection time is calculated server-side to prevent client manipulation
- All timestamps are stored in UTC (TIMESTAMPTZ)
- Battle win/loss tracking must be integrated into your existing battle logic

