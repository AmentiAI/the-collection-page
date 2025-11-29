# Speed Up Cost Confirmation Feature

## Problem
A user attempted to speed up a reveal transaction from 0.2 to 5.0 sat/vB, which cost them 0.0009 BTC (90,000 sats) in new gas costs. This was an unexpectedly high amount that should have triggered a warning.

## Solution
Added a confirmation dialog that appears when the speedup cost exceeds **0.0001 BTC (10,000 sats)**.

## Implementation Details

### Changes Made to `app/tools/speedup/page.tsx`

1. **Added State Variables (lines 200-201):**
   - `showCostConfirmation`: Controls whether the confirmation dialog is visible
   - `pendingSpeedupCost`: Stores the calculated cost in sats for display

2. **Modified `executeSpeedup` Function (lines 937-975):**
   - Calculates the speedup cost based on the selected strategy:
     - **RBF**: Uses `analysis.requiredRbfFee`
     - **CPFP/Hybrid**: Uses `estimate.recommendedChildFee`
   - Checks if cost exceeds 10,000 sats threshold
   - If exceeded and not yet confirmed, shows confirmation dialog
   - If already confirmed (user clicked "Yes, I Confirm"), proceeds with speedup

3. **Added Confirmation Dialog UI (lines 1296-1345):**
   - Warning banner with amber/orange styling
   - Shows cost in both sats and BTC format
   - Two buttons:
     - **"Yes, I Confirm"**: Proceeds with the speedup
     - **"Cancel"**: Dismisses the dialog and resets state
   - Dialog appears between the cost summary and the execute button

## User Flow

### Normal Speedup (< 10,000 sats)
1. User enters TXID and selects strategy
2. User clicks "Execute speedup"
3. Transaction is immediately broadcast

### High-Cost Speedup (≥ 10,000 sats)
1. User enters TXID and selects strategy
2. User clicks "Execute speedup"
3. **Confirmation dialog appears** showing:
   - Warning message
   - Exact cost in sats and BTC
   - Confirmation question
4. User can either:
   - Click "Yes, I Confirm" to proceed
   - Click "Cancel" to abort
5. If confirmed, transaction is broadcast

## Threshold
- **10,000 sats** (0.0001 BTC)
- This threshold can be adjusted by changing `COST_WARNING_THRESHOLD` in the `executeSpeedup` function

## Example Scenarios

### Scenario 1: Small Speedup
- Original fee rate: 1 sat/vB
- Target fee rate: 3 sat/vB
- Cost: ~2,000 sats
- **Result**: No confirmation needed, executes immediately

### Scenario 2: Large Speedup (User's Case)
- Original fee rate: 0.2 sat/vB
- Target fee rate: 5.0 sat/vB
- Cost: ~90,000 sats (0.0009 BTC)
- **Result**: Confirmation dialog appears with warning

### Scenario 3: Threshold Edge Case
- Cost: 10,001 sats
- **Result**: Confirmation dialog appears

## Visual Design
- Amber/orange color scheme to indicate warning
- Large, clear display of cost in both units
- AlertCircle icon for visual warning indicator
- Prominent "Yes, I Confirm" button in warning colors
- Secondary "Cancel" button for easy escape

## Testing Recommendations
1. Test with a transaction that costs < 10,000 sats (should execute immediately)
2. Test with a transaction that costs > 10,000 sats (should show confirmation)
3. Test clicking "Cancel" (should dismiss dialog and allow re-attempt)
4. Test clicking "Yes, I Confirm" (should proceed with speedup)
5. Test both RBF and CPFP strategies with high costs

## Future Enhancements
- Consider making the threshold configurable by the user
- Add a "Don't show this again" checkbox (with caution)
- Show approximate USD value if BTC price is available
- Add historical comparison ("This is X times your normal speedup cost")

