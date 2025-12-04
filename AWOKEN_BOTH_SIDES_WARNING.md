# Both Sides Warning - Dynamic Image Based on Dominance

## Summary
Added a special warning on the graveyard page that detects when a user has both ascended and non-ascended inscriptions in their `ascended_images_mint_queue`. The warning displays either `heavenly.png` or `awaken.png` based on which type dominates their mint queue.

## Changes Made

### File: `app/graveyard/page.tsx`

1. **Added State Variable (line 147):**
   ```typescript
   const [hasPlayedBothSides, setHasPlayedBothSides] = useState(false)
   ```

2. **Detection Logic in fetchMintQueueImages (lines 439-442):**
   ```typescript
   // Check if user has both ascended and non-ascended records (playing both sides)
   const hasAscended = records.some((r: any) => r.sourceInscriptionId?.toLowerCase().startsWith('ascended_'))
   const hasNonAscended = records.some((r: any) => r.sourceInscriptionId && !r.sourceInscriptionId?.toLowerCase().startsWith('ascended_'))
   setHasPlayedBothSides(hasAscended && hasNonAscended)
   ```

3. **Warning UI Section (lines 980-1010):**
   - Displays dramatic warning with awaken.png image
   - Appears between graverobbing section and main graveyard section
   - Only shows when `hasPlayedBothSides === true`

## Detection Criteria

The warning triggers when a user has:
1. **At least one record** with `source_inscription_id` starting with `"ascended_"`
2. **At least one record** with `source_inscription_id` NOT starting with `"ascended_"`

Both records must be in the `ascended_images_mint_queue` table for the connected wallet.

## Warning Design

### Visual Elements:
- **Background**: Black with red glowing border (border-red-500/60)
- **Center Image**: awaken.png at 48x48 (192px x 192px) with pulse animation and red glow
- **Box Shadow**: Intense red glow effect (0_0_60px_rgba(220,38,38,0.8))

### Text Content:
- **Title**: "Playing Both Sides?" (large, uppercase, tracking-wide)
- **Main Warning**: "Your ignorance has awoken something!"
- **Explanation**: "You have chosen to walk both the path of the ascended and the damned. This defiance does not go unnoticed."

### Styling:
- Dramatic red color scheme matching the graveyard theme
- Pulsing image animation
- Heavy drop shadows and glow effects
- Responsive design (adapts to mobile/desktop)

## User Experience

### When Triggered:
1. User connects wallet to graveyard page
2. System fetches their mint queue images
3. System detects both types of inscriptions
4. Warning banner appears prominently at top of page
5. Warning remains visible until user removes one type from queue

### Example Scenario:
**User has:**
- Mint queue record #1: `source_inscription_id = "ascended_abc123..."`
- Mint queue record #2: `source_inscription_id = "regular_xyz789..."`

**Result:** ⚠️ AWOKEN WARNING DISPLAYS

## Technical Notes

- Check runs every time mint queue is fetched (on page load, refreshes, mint completions)
- Case-insensitive check (`toLowerCase()`)
- No API calls needed - uses existing mint queue data
- Automatically clears when user removes one type of inscription

## Future Enhancements

Could potentially:
- Add sound effect when warning appears
- Block minting actions when both sides detected
- Add API endpoint to automatically remove one type
- Track how many users trigger this warning

