# Twitter OAuth Setup Guide

## Step 1: Create a Twitter Developer Account

1. Go to the [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Sign in with your Twitter account
3. Apply for a developer account if you don't have one (usually approved quickly)

## Step 2: Create a Twitter App

1. In the Twitter Developer Portal, go to **"Projects & Apps"**
2. Click **"Create App"** or **"Create Project"** (if you don't have a project yet)
3. Fill in the app details:
   - **App name**: Your app name (e.g., "The Damned Dashboard")
   - **Type of App**: Select **"Web App, Automated App or Bot"**
   - **Description**: Brief description of your app
   - **Website URL**: Your website URL (e.g., `https://www.thedamned.xyz`)
   - **Callback URI / Redirect URL**: `https://www.thedamned.xyz/api/twitter/callback`
   - **App permissions**: Select **"Read"** (you only need to read user info)

## Step 3: Get Your Client ID and Client Secret

1. After creating your app, go to your app's **"Keys and tokens"** section
2. You'll see:
   - **Client ID** - Copy this (you'll need it for `TWITTER_CLIENT_ID`)
   - **Client Secret** - Click **"Regenerate"** if needed, then copy it (you'll need it for `TWITTER_CLIENT_SECRET`)

⚠️ **Important**: 
- Never commit your Client Secret to version control!
- Store it securely in your environment variables
- If you regenerate the secret, update your `.env` file immediately

## Step 4: Configure OAuth 2.0 Settings

1. In your app settings, go to **"User authentication settings"**
2. Enable **"OAuth 2.0"**
3. Set **"Type of App"** to **"Web App, Automated App or Bot"**
4. Set **"App permissions"** to **"Read"** (we only need to read user info)
5. Under **"Callback URI / Redirect URL"**, add:
   ```
   https://www.thedamned.xyz/api/twitter/callback
   ```
   For local development, you can also add:
   ```
   http://localhost:3000/api/twitter/callback
   ```
6. Set **"Website URL"** to your website URL:
   ```
   https://www.thedamned.xyz
   ```
7. Click **"Save"**

## Step 5: Set Environment Variables

Add these to your `.env.local` file:

```env
# Twitter OAuth Configuration
TWITTER_CLIENT_ID=your_client_id_here
TWITTER_CLIENT_SECRET=your_client_secret_here

# Optional: Override redirect URI (defaults to NEXT_PUBLIC_SITE_URL/api/twitter/callback)
TWITTER_REDIRECT_URI=https://www.thedamned.xyz/api/twitter/callback

# For production, set your site URL
NEXT_PUBLIC_SITE_URL=https://www.thedamned.xyz
```

⚠️ **Important**: 
- No quotes around the values
- No spaces before or after the `=` sign
- No spaces in the Client ID or Secret

## Step 6: Initialize Database

Run the database initialization to create the `twitter_users` table:

```bash
# Visit this endpoint or call it from your code
GET /api/init-db
```

Or if you have a script:
```bash
npm run init-db
```

## Step 7: Test the Integration

1. Start your Next.js server:
   ```bash
   npm run dev
   ```

2. Go to your dashboard: `http://localhost:3000/dashboard`

3. Connect your wallet

4. Click **"Connect Twitter"** in the My Profile section

5. You should be redirected to Twitter to authorize

6. After authorizing, you'll be redirected back to the dashboard

7. The Twitter username should appear below "Twitter" in the Social Accounts section

## Troubleshooting

### Error: `invalid_client`
- **Cause**: Client ID or Client Secret is incorrect
- **Fix**: 
  1. Go to Twitter Developer Portal > Your App > Keys and tokens
  2. Verify your Client ID matches what's in `.env`
  3. If Client Secret was regenerated, copy the new one
  4. Update `TWITTER_CLIENT_SECRET` in `.env`
  5. Restart your server

### Error: `redirect_uri_mismatch`
- **Cause**: Redirect URI doesn't match what's configured in Twitter Developer Portal
- **Fix**: 
  1. Check that `TWITTER_REDIRECT_URI` in `.env` matches exactly what's in Twitter Developer Portal
  2. Must match exactly: `https://www.thedamned.xyz/api/twitter/callback` (no trailing slash)
  3. Restart your server

### Error: `missing_verifier`
- **Cause**: Code verifier cookie was lost (this should be rare)
- **Fix**: 
  - Try the auth flow again
  - Make sure cookies are enabled in your browser
  - Check that your server is handling cookies correctly

### Error: `invalid_grant`
- **Cause**: Authorization code expired or was already used
- **Fix**: 
  - Try the auth flow again (codes expire after 10 minutes)
  - Make sure you're completing the flow quickly

## How It Works

1. User clicks "Connect Twitter" on dashboard
2. App redirects to `/api/twitter/auth` with `walletAddress` as query param
3. Server generates PKCE code verifier and challenge
4. Server creates OAuth URL with:
   - `client_id`: Your Twitter app Client ID
   - `redirect_uri`: Your callback URL
   - `scope`: `tweet.read users.read` (we only need user info)
   - `state`: The wallet address (to link them after auth)
   - `code_challenge`: SHA256 hash of code verifier
   - `code_challenge_method`: `S256`
5. Code verifier is stored in httpOnly cookie
6. User authorizes on Twitter
7. Twitter redirects to `/api/twitter/callback` with `code` and `state`
8. Server exchanges `code` for access token using code verifier
9. Server fetches Twitter user info using access token
10. Server links Twitter user ID to wallet address in database
11. User is redirected back to dashboard with success status

## Security Notes

- PKCE (Proof Key for Code Exchange) is used for security
- Code verifier is stored in httpOnly cookie (prevents XSS attacks)
- Client secret is only used server-side (never exposed to client)
- OAuth state parameter prevents CSRF attacks
- All sensitive data is stored securely in environment variables

## API Routes Created

- **`/api/twitter/auth`**: Initiates Twitter OAuth flow
- **`/api/twitter/callback`**: Handles Twitter OAuth callback
- **`/api/profile/twitter`**: Gets Twitter link status for a wallet address

## Database Schema

The `twitter_users` table stores:
- `id`: UUID primary key
- `twitter_user_id`: Twitter user ID (unique)
- `twitter_username`: Twitter username (@handle)
- `profile_id`: Foreign key to `profiles` table
- `verified_at`: Timestamp when linked
- `created_at`: Timestamp when record created
- `updated_at`: Timestamp when record updated

