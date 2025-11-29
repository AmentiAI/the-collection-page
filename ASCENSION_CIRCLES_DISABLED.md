# Ascension Circles Creation Disabled

## Summary
Disabled the ability to create new Ascension circles via the API. The UI tab was already hidden, and now the backend API also rejects creation requests.

## Changes Made

### File: `app/api/ascension/circles/route.ts`

**Modified POST endpoint (lines 232-237):**
Added an immediate rejection at the start of the POST function:

```typescript
export async function POST(request: NextRequest) {
  // Ascension circle creation is disabled
  return NextResponse.json(
    { success: false, error: 'Ascension circle creation is currently disabled.' },
    { status: 503 },
  )
  
  // ... rest of the code (now unreachable but preserved)
}
```

## What's Blocked

### Frontend (Previously Disabled):
- ❌ Ascension tab hidden from `/abyss-summon` page UI
- ❌ No way to switch to ascension mode in the interface

### Backend (Now Disabled):
- ❌ POST to `/api/ascension/circles` - Returns 503 with error message
- ❌ Cannot create new ascension circles via API
- ❌ Any programmatic attempts to create circles are rejected

### What Still Works:
- ✅ GET `/api/ascension/circles` - Can still fetch existing circles
- ✅ Joining existing circles (if any remain active)
- ✅ Completing existing circles (if any remain active)
- ✅ Viewing ascension leaderboard

## Error Response

When attempting to create an ascension circle:

**Status Code:** `503 Service Unavailable`

**Response:**
```json
{
  "success": false,
  "error": "Ascension circle creation is currently disabled."
}
```

## User Experience

### Before:
1. User could navigate to Ascension tab
2. User could click "Initiate Circle"
3. New ascension circle would be created

### After:
1. ❌ User cannot see Ascension tab (hidden in UI)
2. ❌ If user tries API directly, gets 503 error
3. ❌ Error message: "Ascension circle creation is currently disabled."

## Re-enabling Ascension Circles

To re-enable in the future:

### 1. Backend (API):
Remove or comment out the early return in `app/api/ascension/circles/route.ts`:
```typescript
// Remove these lines:
return NextResponse.json(
  { success: false, error: 'Ascension circle creation is currently disabled.' },
  { status: 503 },
)
```

### 2. Frontend (UI):
Add the Ascension button back in `app/abyss-summon/components/MainNavigationTabs.tsx`:
```tsx
<button
  type="button"
  onClick={() => handleModeChange('powder')}
  className={...}
>
  Ascension
</button>
```

## Technical Notes

- The rest of the POST function code remains intact but is unreachable
- This makes it easy to re-enable by just removing the early return
- No database changes needed
- No impact on existing ascension circles (they can still be completed)
- GET endpoint still works for fetching data

## Related Changes

1. **UI Tabs Hidden** (see `ABYSS_SUMMON_TAB_VISIBILITY.md`)
   - Ascension tab removed from `/abyss-summon` navigation

2. **Only Portal Circles Visible**
   - Users can only create and join Portal circles now
   - Simplified experience focused on one circle type

## Files Modified

- `app/api/ascension/circles/route.ts` - Added rejection at POST endpoint

