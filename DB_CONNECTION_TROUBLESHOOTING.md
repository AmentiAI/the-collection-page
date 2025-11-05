# Database Connection Troubleshooting

## Connection Timeout Issues

If you're getting connection timeout errors, try these steps:

### 1. Test the Connection

Visit: `http://localhost:3000/api/test-db`

This will test if the database connection is working.

### 2. Check Environment Variable

Make sure your `.env.local` file has either:
```
NEON_DB=postgresql://user:password@host/database?sslmode=require
```
or
```
SUPABASE_DB=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
```

**Important:** If your password contains special characters like `$`, `@`, `#`, etc., you may need to URL-encode them:
- `$` becomes `%24`
- `@` becomes `%40`
- `#` becomes `%23`

### 3. Verify Connection String Format

**For Neon:**
```
postgresql://USERNAME:PASSWORD@HOST/DATABASE?sslmode=require
```

**For Supabase:**
```
postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
```

Example (Neon):
```
NEON_DB=postgresql://neondb_owner:password@ep-quiet-cherry-a5xikt6a-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 4. Check Supabase Settings

1. Go to your Supabase project dashboard
2. Navigate to Settings > Database
3. Check the connection pooler settings
4. Make sure the database is not paused

### 5. Connection Pooling

If you're using Supabase, you might want to use their connection pooler instead:
- Port `5432` = Direct connection
- Port `6543` = Connection pooler (recommended for serverless)

Try changing the port in your connection string to `6543`.

### 6. Network/Firewall

Make sure:
- Your IP is allowed in Supabase dashboard
- No firewall is blocking the connection
- VPN is not interfering

### 7. SSL Issues

The connection uses SSL with `rejectUnauthorized: false`. If you're still having issues, check if Supabase requires specific SSL settings.

## Quick Fixes

1. **Increase timeout** - Already done in the code (10 seconds)
2. **Use connection pooler** - Change port to 6543
3. **URL encode password** - Encode special characters
4. **Check database status** - Ensure Supabase database is active

## Testing

1. Test connection: `/api/test-db`
2. Initialize database: `/api/init-db`
3. Check logs in browser console and server logs

