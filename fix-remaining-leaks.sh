#!/bin/bash
# Script to document remaining connection leak fixes needed
# All remaining endpoints need the same fix pattern:
# 1. const client = await pool.connect()
# 2. Replace all pool.query with client.query in transaction
# 3. Add finally { client.release() }

echo "Remaining endpoints to fix:"
echo "✅ 1. dead-demons/circles/[circleId]/join/route.ts - DONE"
echo "⏳ 2. damned-pool/circles/[circleId]/join/route.ts"
echo "⏳ 3. ascension/circles/[circleId]/join/route.ts"
echo "⏳ 4. abyss/summons/[summonId]/join/route.ts"
echo "⏳ 5-8. Complete endpoints (4 files)"
echo "⏳ 9. dismiss endpoint"
echo "⏳ 10-11. AFK endpoints (2 files)"
echo "⏳ 12-13. wallet/link and profile/reset-karma"

