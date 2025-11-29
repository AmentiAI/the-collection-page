# Abyss Summon Tab Visibility Changes

## Summary
Modified the /abyss-summon page to hide Abyss circles and Dead Demons circles, showing only Portal circles and Ascension circles.

## Changes Made

### File: `app/abyss-summon/components/MainNavigationTabs.tsx`

**Removed:**
- "Abyss" tab button (previously lines 29-40)
- "Dead Demons" tab button (previously lines 65-76)

**Kept:**
- "Ascension" tab button
- "Portal" tab button

## Result

Users visiting /abyss-summon will now see only two tabs:
1. **Ascension** - For ascension circles (powder mode)
2. **Portal** - For portal circles (damned_pool mode)

The page already defaults to "Portal" mode (`damned_pool`), so users will land on the Portal circles view by default.

## Modes Still Available (Technical)

While the tabs are hidden, the underlying modes still exist in the codebase:
- `powder` - Ascension circles (visible)
- `damned_pool` - Portal circles (visible)
- `abyss` - Abyss circles (hidden from UI)
- `dead_demons` - Dead Demons circles (hidden from UI)

The hidden modes can still be accessed programmatically but there are no UI controls to switch to them.

## User Experience

- Cleaner interface with fewer options
- Focus on Portal and Ascension circles only
- Default landing is Portal circles
- Leaderboard links remain unchanged (Summoning and Ascension)

