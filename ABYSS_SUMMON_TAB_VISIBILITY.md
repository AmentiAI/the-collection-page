# Abyss Summon Tab Visibility Changes

## Summary
Modified the /abyss-summon page to show ONLY Portal circles. All other circle types (Abyss, Dead Demons, and Ascension) are now hidden.

## Changes Made

### File: `app/abyss-summon/components/MainNavigationTabs.tsx`

**Removed:**
- "Abyss" tab button
- "Dead Demons" tab button
- "Ascension" tab button

**Kept:**
- "Portal" tab button (only visible tab)

## Result

Users visiting /abyss-summon will now see only ONE tab:
1. **Portal** - For portal circles (damned_pool mode)

The page defaults to "Portal" mode (`damned_pool`), and since it's the only tab, users will always see Portal circles.

## Modes Still Available (Technical)

While the tabs are hidden, the underlying modes still exist in the codebase:
- `damned_pool` - Portal circles (visible - ONLY option)
- `powder` - Ascension circles (hidden from UI)
- `abyss` - Abyss circles (hidden from UI)
- `dead_demons` - Dead Demons circles (hidden from UI)

The hidden modes can still be accessed programmatically but there are no UI controls to switch to them.

## User Experience

- Simplified interface with single focus
- Dedicated to Portal circles only
- No tab switching needed (only one option)
- Leaderboard links remain unchanged (Summoning and Ascension)

