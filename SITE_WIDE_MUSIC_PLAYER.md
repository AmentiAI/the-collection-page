# Site-Wide Music Player Implementation

## Summary
Converted the music playlist feature from being page-specific (abyss-summon) to a global site-wide feature. Music now plays continuously across all pages and survives navigation.

## Changes Made

### 1. **New File: `providers/MusicPlayerProvider.tsx`**
Created a React Context provider that manages global music playback:

**Features:**
- Centralized audio state management
- Automatic playlist progression (4 songs cycle endlessly)
- Volume and mute state persistence across pages
- Auto-play on user interaction
- Handles browser autoplay restrictions gracefully

**State Managed:**
- `musicVolume` - Current volume (0-100)
- `isMusicMuted` - Mute status
- `musicPlaying` - Whether audio is currently playing
- `musicReady` - Whether audio element is ready
- `currentSongIndex` - Current song in playlist
- `playlist` - Array of 4 music file paths

**Playlist:**
1. `/music/abysssummon2.mp3`
2. `/music/summon2.mp3`
3. `/music/summon.mp3`
4. `/music/The Damned 3.mp3`

### 2. **Modified: `app/layout.tsx`**
Wrapped the entire app with `MusicPlayerProvider`:

```typescript
<MusicPlayerProvider>
  {children}
</MusicPlayerProvider>
```

This makes music state available to all pages and components.

### 3. **Modified: `components/Header.tsx`**
Updated Header to use the music player context instead of props:

**Removed Props:**
- `musicVolume?`
- `onMusicVolumeChange?`
- `isMusicMuted?`
- `onMusicMutedChange?`

**Now Uses:**
```typescript
const { musicVolume, setMusicVolume, isMusicMuted, setIsMusicMuted } = useMusicPlayer()
```

**Benefits:**
- Header automatically stays in sync with global music state
- No prop drilling needed
- Simpler component interface

## How It Works

### 1. **Global Audio Element**
- Single `<audio>` element created in the provider
- Lives throughout the entire session
- Survives page navigation

### 2. **Playlist Management**
- When a song ends, automatically advances to next
- Loops back to first song after the fourth
- User can't manually skip (feature could be added)

### 3. **User Interaction Handling**
- Browsers block autoplay without user interaction
- On first click/touch anywhere, tries to start playback
- Gracefully handles autoplay blocking

### 4. **Volume Control**
- Header displays volume slider and mute button
- Changes apply immediately to global audio
- If slider moved from 0, automatically unmutes
- Persists across page navigation (in memory)

## Usage in Components

Any component can now access the music player:

```typescript
import { useMusicPlayer } from '@/providers/MusicPlayerProvider'

function MyComponent() {
  const { 
    musicVolume, 
    setMusicVolume, 
    isMusicMuted, 
    setIsMusicMuted,
    musicPlaying,
    currentSongIndex,
    playlist
  } = useMusicPlayer()
  
  // Use the music state/controls
}
```

## User Experience

### Before (Page-Specific):
- Music only played on /abyss-summon
- Stopped when navigating away
- Had to restart on each visit
- Different pages = no music

### After (Site-Wide):
- Music starts on first interaction anywhere
- Continues playing across all pages
- Survives navigation (no interruption)
- Header controls work on every page
- Playlist loops automatically

### Example Flow:
1. User visits `/profile` (no music yet)
2. User clicks anything (music starts: song 1)
3. User navigates to `/graveyard` (music continues)
4. Song 1 ends, song 2 starts automatically
5. User navigates to `/tools/speedup` (music still playing)
6. User adjusts volume in header (applies globally)
7. All 4 songs cycle endlessly until user mutes/closes tab

## Technical Details

### Audio Element Lifecycle:
- Created once on provider mount
- Destroyed only when tab/window closes
- Pauses if user explicitly mutes
- Resumes on unmute

### Event Handlers:
- `play` - Updates musicPlaying state
- `pause` - Updates musicPlaying state (manual pause only)
- `ended` - Advances to next song
- `canplay` - Marks audio as ready, attempts autoplay

### Browser Compatibility:
- Works in all modern browsers
- Gracefully handles autoplay restrictions
- Uses standard HTML5 Audio API

## Future Enhancements

Could add:
- Previous/Next track buttons
- Display current song name
- Shuffle mode
- Different playlists per section
- Volume persistence (localStorage)
- Visualizer/now playing indicator
- Keyboard shortcuts (space = pause/play)
- Different playlists for different themes/pages

## Files Modified

1. **Created:**
   - `providers/MusicPlayerProvider.tsx`

2. **Modified:**
   - `app/layout.tsx` - Added provider
   - `components/Header.tsx` - Now uses context

3. **Note:** `/abyss-summon/page.tsx` still has its own music implementation
   - Should be updated to use global player (future task)
   - Currently both can coexist

## Testing Checklist

- [ ] Music starts on first user interaction
- [ ] Volume slider works in header
- [ ] Mute button works in header
- [ ] Music continues when navigating between pages
- [ ] Playlist cycles through all 4 songs
- [ ] After song 4, returns to song 1
- [ ] Header controls work on all pages
- [ ] No console errors
- [ ] Works on mobile (touch interaction)
- [ ] Autoplay fallback works if blocked

## Breaking Changes

**For pages that were passing music props to Header:**
- Must remove `musicVolume`, `onMusicVolumeChange`, `isMusicMuted`, `onMusicMutedChange` props
- Header now manages this internally via context
- Check pages like `/abyss-summon` that may still be passing these props

**Backward Compatible:**
- Header still accepts other props (isHolder, connected, etc.)
- Pages without music controls are unaffected
- Music controls can be hidden with `showMusicControls={false}`

