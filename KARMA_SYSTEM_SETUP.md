# Karma Points System Setup

## Initial Setup

1. **Initialize the database tables** by visiting:
   ```
   http://localhost:3000/api/init-db
   ```
   Or call it programmatically after setting up your environment.

2. **Environment Variables**
   Make sure you have `SUPABASE_DB` set in your `.env.local` file:
   ```
   SUPABASE_DB=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
   ```

## Database Schema

### Tables Created:

1. **profiles** - User profiles linked to wallet addresses
   - `id` (UUID)
   - `wallet_address` (TEXT, UNIQUE)
   - `username` (TEXT, nullable)
   - `avatar_url` (TEXT, nullable)
   - `total_good_karma` (INTEGER, default 0)
   - `total_bad_karma` (INTEGER, default 0)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **karma_points** - History of all karma points given
   - `id` (UUID)
   - `profile_id` (UUID, references profiles)
   - `points` (INTEGER)
   - `type` (TEXT, 'good' or 'bad')
   - `reason` (TEXT, nullable)
   - `given_by` (TEXT, nullable - wallet address)
   - `created_at` (TIMESTAMPTZ)

## API Endpoints

### Profile Management
- `GET /api/profile?walletAddress=xxx` - Get or create profile
- `POST /api/profile` - Update profile (username, avatar)

### Karma Points
- `POST /api/karma` - Add karma points
  ```json
  {
    "walletAddress": "bc1...",
    "points": 10,
    "type": "good",
    "reason": "Helped a community member",
    "givenBy": "bc1..."
  }
  ```
- `GET /api/karma?walletAddress=xxx` - Get karma history

### Leaderboard
- `GET /api/leaderboard?type=good&limit=50` - Get good karma leaderboard
- `GET /api/leaderboard?type=bad&limit=50` - Get bad karma leaderboard

## Dashboard Features

The dashboard now includes three sections:

1. **My Damned** - View your ordinals collection
2. **Leaderboard** - See top users by good/bad karma
3. **Points History** - View your karma history with reasons

## Automatic Features

- Profiles are automatically created when a wallet connects
- Karma totals are automatically updated via database triggers
- Points are tracked with full history and reasons


