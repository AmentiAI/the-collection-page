# Graveyard Faction Warnings System

## Summary
Added a dynamic warning system on the graveyard page that displays different images and messages based on the user's mint queue composition. The system tracks whether users are dedicated to one faction or playing both sides.

## Three Warning States

### 1. **Dedication Warning** (waters.png)
**Triggers when:** User has 2+ mint queue records of ONLY one type (all ascended OR all non-ascended)

**Visual:**
- Image: `waters.png`
- Border: Cyan glow (border-cyan-500/60)
- Shadow: Cyan (0_0_60px_rgba(6,182,212,0.8))
- Size: 384px mobile, 512px desktop
- Animation: Pulse effect

**Message:**
```
UNWAVERING LOYALTY

Your dedication to one faction is remarkable

The waters stir in recognition of your commitment. 
You have chosen your path with clarity.
```

---

### 2. **Heavenly Warning** (heavenly.png)
**Triggers when:** User has BOTH types of inscriptions AND more ascended than non-ascended

**Visual:**
- Image: `heavenly.png`
- Border: Amber glow (border-amber-500/60)
- Shadow: Amber (0_0_60px_rgba(251,191,36,0.8))
- Size: 384px mobile, 512px desktop
- Animation: Pulse effect

**Message:**
```
DIVINE CONFLICT

The heavens watch your indecision!

You have chosen to walk both the path of the ascended 
and the damned. This defiance does not go unnoticed.
```

---

### 3. **Awoken Warning** (awaken.png)
**Triggers when:** User has BOTH types of inscriptions AND more non-ascended than ascended (or equal)

**Visual:**
- Image: `awaken.png`
- Border: Red glow (border-red-500/60)
- Shadow: Red (0_0_60px_rgba(220,38,38,0.8))
- Size: 384px mobile, 512px desktop
- Animation: Pulse effect

**Message:**
```
PLAYING BOTH SIDES?

Your ignorance has awoken something!

You have chosen to walk both the path of the ascended 
and the damned. This defiance does not go unnoticed.
```

---

## Detection Logic

### Code Implementation:
```typescript
const ascendedCount = records.filter(r => 
  r.sourceInscriptionId?.toLowerCase().startsWith('ascended_')
).length

const nonAscendedCount = records.filter(r => 
  r.sourceInscriptionId && 
  !r.sourceInscriptionId?.toLowerCase().startsWith('ascended_')
).length

// Dedication check (only one type, 2+ records)
const totalRecords = ascendedCount + nonAscendedCount
const isOnlyOneSide = (ascendedCount > 0 && nonAscendedCount === 0) || 
                      (ascendedCount === 0 && nonAscendedCount > 0)
showDedication = isOnlyOneSide && totalRecords > 1

// Both sides check
playingBothSides = ascendedCount > 0 && nonAscendedCount > 0

// Image selection (if playing both sides)
image = ascendedCount > nonAscendedCount ? 'heavenly' : 'awaken'
```

### Examples:

**Example 1: Dedication**
- 5 ascended inscriptions
- 0 non-ascended inscriptions
- **Result:** 💧 Waters warning (cyan)

**Example 2: Dedication (other side)**
- 0 ascended inscriptions  
- 3 non-ascended inscriptions
- **Result:** 💧 Waters warning (cyan)

**Example 3: Heavenly Conflict**
- 4 ascended inscriptions
- 2 non-ascended inscriptions
- **Result:** ✨ Heavenly warning (amber)

**Example 4: Awoken**
- 1 ascended inscription
- 3 non-ascended inscriptions
- **Result:** 🔥 Awoken warning (red)

**Example 5: No Warning**
- 1 inscription (either type)
- **Result:** No warning shown

---

## State Variables

```typescript
const [hasPlayedBothSides, setHasPlayedBothSides] = useState(false)
const [bothSidesImage, setBothSidesImage] = useState<'heavenly' | 'awaken'>('awaken')
const [showDedicationWarning, setShowDedicationWarning] = useState(false)
```

## Files Modified

- `app/graveyard/page.tsx` - Added detection logic and warning UI sections
- Image assets used:
  - `/public/waters.png` - Dedication warning
  - `/public/heavenly.png` - Divine conflict warning
  - `/public/awaken.png` - Awoken warning

## Design Features

- **Responsive:** Works on mobile and desktop with different sizes
- **Animated:** All images have pulse animation
- **Themed:** Each warning has appropriate color scheme (cyan/amber/red)
- **Dynamic:** Automatically updates when mint queue changes
- **Non-intrusive:** Only shows when 2+ records exist

## Future Enhancements

- Add sound effects for each warning type
- Track analytics on which warning is most common
- Add hover tooltips with more details
- Add animation transitions when switching between warnings

