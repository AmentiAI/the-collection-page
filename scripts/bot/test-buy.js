// Test script to simulate Luminex Bitcoin token buys for testing
import { addTestBuy } from './discord-bot.js';

// Wait a moment for token list to load
setTimeout(() => {
  const tokenKey = process.argv[2] || 'TEST'; // Token symbol/ticker

  console.log(`Testing buy alerts for Luminex Bitcoin token: ${tokenKey}`);
  console.log('Sending 6 buys in quick succession...');

  // Simulate 6 buys quickly (0.001 BTC each = ~$65 each at current prices)
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const amountBtc = 0.001; // 0.001 BTC per buy
      const amountUsd = amountBtc * 65000; // Approx $65k BTC price
      addTestBuy(tokenKey, `test_tx_${Date.now()}_${i}`, amountBtc, amountUsd);
      console.log(`Buy ${i + 1}/6 recorded for ${tokenKey} (${amountBtc} BTC = $${amountUsd.toFixed(2)})`);
    }, i * 100); // 100ms apart
  }

  console.log('Test buys sent. Check Discord channel for alerts!');
}, 2000); // Wait 2 seconds for token list to load

