# Discord OAuth Setup Guide

## Step 1: Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** in the top right
3. Give your application a name (e.g., "The Damned Dashboard")
4. Click **"Create"**

## Step 2: Get Your Client ID and Client Secret

1. In your application, go to the **"OAuth2"** section in the left sidebar
2. Under **"General"**, you'll see:
   - **Client ID** - Copy this (you'll need it for `DISCORD_CLIENT_ID`)
   - **Client Secret** - Click **"Reset Secret"** if needed, then copy it (you'll need it for `DISCORD_CLIENT_SECRET`)

⚠️ **Important**: Never commit your Client Secret to version control!

## Step 3: Set Up Redirect URI

1. Still in the **"OAuth2"** section, scroll down to **"Redirects"**
2. Click **"Add Redirect"**
3. Add your redirect URI(s):

   **For local development:**
   ```
   http://localhost:3000/api/discord/callback
   ```

   **For production:**
   ```
   https://yourdomain.com/api/discord/callback
   ```

4. Click **"Save Changes"**

⚠️ **Important**: The redirect URI must match **exactly** (including `http://` vs `https://`, trailing slashes, etc.)

## Step 4: Configure OAuth2 Scopes

1. Still in the **"OAuth2"** section, scroll to **"OAuth2 URL Generator"**
2. Under **"Scopes"**, select:
   - ✅ `identify` - This is what the code uses to get user info

3. Under **"Redirect URL"**, select the redirect URI you just added

4. The generated URL at the bottom is just for testing - you don't need to copy it

## Step 5: Set Environment Variables

Add these to your `.env.local` file:

```env
# Discord OAuth Configuration
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here

# Optional: Override redirect URI (defaults to NEXT_PUBLIC_SITE_URL/api/discord/callback)
DISCORD_REDIRECT_URI=http://localhost:3000/api/discord/callback

# For production, set your site URL
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

**For local development:**
```env
DISCORD_CLIENT_ID=1234567890123456789
DISCORD_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz123456
DISCORD_REDIRECT_URI=http://localhost:3000/api/discord/callback
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**For production:**
```env
DISCORD_CLIENT_ID=1234567890123456789
DISCORD_CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz123456
DISCORD_REDIRECT_URI=https://yourdomain.com/api/discord/callback
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## Step 6: Test the Flow

1. Make sure your Next.js dev server is running
2. Go to `/dashboard` and connect your wallet
3. Click the **"Connect Discord"** button
4. You should be redirected to Discord to authorize
5. After authorization, you'll be redirected back to the dashboard
6. Your Discord account should now be linked!

## Troubleshooting

### "Invalid redirect_uri" Error
- Check that the redirect URI in Discord Developer Portal **exactly matches** your `DISCORD_REDIRECT_URI` env variable
- Make sure there are no trailing slashes or extra spaces
- For localhost, use `http://` not `https://`

### "Invalid client" Error
- Verify your `DISCORD_CLIENT_ID` is correct
- Make sure you copied the Client ID (not the Application ID)

### "Invalid client secret" Error
- Verify your `DISCORD_CLIENT_SECRET` is correct
- If you reset the secret, make sure you copied the new one

### Authorization works but linking fails
- Check your database connection
- Verify the `profiles` table exists (run `/api/init-db` if needed)
- Check server logs for any database errors

## Security Notes

- ⚠️ **Never commit** `DISCORD_CLIENT_SECRET` to git
- Use environment variables for all sensitive values
- For production, consider using a secrets manager
- The `state` parameter in the OAuth flow is used to pass the wallet address - this is validated in the callback

## How It Works

1. User clicks "Connect Discord" on dashboard
2. App redirects to `/api/discord/auth` with `walletAddress` as query param
3. Server creates OAuth URL with:
   - `client_id`: Your Discord app Client ID
   - `redirect_uri`: Your callback URL
   - `scope`: `identify`
   - `state`: The wallet address (to link them after auth)
4. User authorizes on Discord
5. Discord redirects to `/api/discord/callback` with `code` and `state`
6. Server exchanges `code` for access token
7. Server fetches Discord user info using access token
8. Server links Discord user ID to wallet address in database
9. User is redirected back to dashboard with success status
