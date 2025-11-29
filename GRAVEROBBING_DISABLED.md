# Graverobbing Feature Disabled

## Summary
Disabled the graverobbing feature on the graveyard page (`/app/graveyard/page.tsx`).

## Changes Made

### File: `app/graveyard/page.tsx`

1. **Added Feature Flag (line 36-37):**
   ```typescript
   const GRAVEYARD_LIMIT = 180
   const GRAVEROBBING_ENABLED = false // Feature flag to enable/disable grave robbing
   ```

2. **Wrapped Grave Robbing Section in Conditional (lines 911-969):**
   - Added `{GRAVEROBBING_ENABLED && (` wrapper around the entire graverobbing UI section
   - This hides the entire "Grave Robbing" card/section from the page

3. **Conditionally Load Grave Rob Eligible Count (lines 389-396):**
   - Modified the `useEffect` to only call `loadGraveRobEligibleCount()` when `GRAVEROBBING_ENABLED` is true
   - Prevents unnecessary API calls when the feature is disabled

## What's Hidden

When `GRAVEROBBING_ENABLED = false`, the following is completely hidden from users:

- **Grave Robbing Section** containing:
  - "Grave Robbing" title
  - Eligible count display (e.g., "5 Eligible")
  - Description: "Spend 150 powder for a 10% chance to steal ownership..."
  - "Attempt Grave Rob (150 Powder)" button
  - Insufficient powder message
  - Status messages ("Grave robbing is over...", "Loading eligible graves...")

## API Calls Disabled

- No longer calls `/api/abyss/burns/grave-rob?walletAddress=...` (GET - to check eligible count)
- Users cannot trigger POST to `/api/abyss/burns/grave-rob` (the actual grave rob attempt)

## Backend Note

While the frontend is disabled, the backend API endpoints still exist and are functional. If needed, you may also want to disable or restrict the backend endpoints:
- `GET /api/abyss/burns/grave-rob` - Returns eligible grave count
- `POST /api/abyss/burns/grave-rob` - Attempts grave robbing

## Re-enabling the Feature

To re-enable graverobbing in the future, simply change:
```typescript
const GRAVEROBBING_ENABLED = false
```
to:
```typescript
const GRAVEROBBING_ENABLED = true
```

No other code changes are needed. The feature is fully preserved and will work when the flag is set back to `true`.

