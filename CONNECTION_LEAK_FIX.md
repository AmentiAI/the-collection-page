# Database Connection Leak Fix

## Problem
17 API endpoints use `pool.query('BEGIN')` without acquiring a dedicated client connection. This causes connection leaks because:

1. `pool.query('BEGIN')` gets a connection from the pool
2. Subsequent `pool.query()` calls may get DIFFERENT connections
3. Early returns or errors leave connections in "idle in transaction" state
4. These leaked connections eventually exhaust the connection pool

## Affected Files
1. app/api/damned-pool/circles/route.ts (POST)
2. app/api/abyss/summons/route.ts (POST)
3. app/api/ascension/circles/route.ts (POST)
4. app/api/dead-demons/circles/route.ts (POST)
5. app/api/dead-demons/circles/[circleId]/join/route.ts (POST)
6. app/api/dead-demons/circles/[circleId]/complete/route.ts (POST)
7. app/api/damned-pool/circles/[circleId]/join/route.ts (POST)
8. app/api/damned-pool/circles/[circleId]/complete/route.ts (POST)
9. app/api/ascension/circles/[circleId]/join/route.ts (POST)
10. app/api/ascension/circles/[circleId]/complete/route.ts (POST)
11. app/api/ascension/circles/[circleId]/dismiss/route.ts (POST)
12. app/api/abyss/summons/[summonId]/join/route.ts (POST)
13. app/api/abyss/summons/[summonId]/complete/route.ts (POST)
14. app/api/afk-circle/route.ts (POST)
15. app/api/afk-circle/reward/route.ts (POST)
16. app/api/wallet/link/route.ts (POST)
17. app/api/profile/reset-karma/route.ts (POST)

## Solution Pattern

### WRONG (Current):
```typescript
await pool.query('BEGIN')
try {
  await pool.query('SELECT ...') // Might get different connection!
  await pool.query('ROLLBACK') // Might rollback wrong connection!
  return // Connection with BEGIN never cleaned up!
} catch (error) {
  await pool.query('ROLLBACK') // Might rollback wrong connection!
}
```

### CORRECT:
```typescript
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('SELECT ...') // Same connection
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release() // ALWAYS release
}
```

## Priority
**CRITICAL** - This is causing the database connection exhaustion reported by the user.

## Fix Status
- [x] damned-pool/circles/route.ts
- [x] abyss/summons/route.ts
- [x] ascension/circles/route.ts
- [x] dead-demons/circles/route.ts
- [ ] dead-demons/circles/[circleId]/join/route.ts
- [ ] dead-demons/circles/[circleId]/complete/route.ts
- [ ] damned-pool/circles/[circleId]/join/route.ts
- [ ] damned-pool/circles/[circleId]/complete/route.ts
- [ ] ascension/circles/[circleId]/join/route.ts
- [ ] ascension/circles/[circleId]/complete/route.ts
- [ ] ascension/circles/[circleId]/dismiss/route.ts
- [ ] abyss/summons/[summonId]/join/route.ts
- [ ] abyss/summons/[summonId]/complete/route.ts
- [ ] afk-circle/route.ts
- [ ] afk-circle/reward/route.ts
- [ ] wallet/link/route.ts
- [ ] profile/reset-karma/route.ts

