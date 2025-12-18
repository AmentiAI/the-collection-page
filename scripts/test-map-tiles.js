/**
 * Test script to verify map tile API is working
 * Run with: node scripts/test-map-tiles.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 ========== MAP TILE API TEST ==========\n');

// Check if map file exists
const mapPath = path.join(process.cwd(), 'public', 'map.webp');
console.log('📁 Checking map file...');
console.log('   Path:', mapPath);
console.log('   Exists:', fs.existsSync(mapPath));

if (fs.existsSync(mapPath)) {
  const stats = fs.statSync(mapPath);
  console.log('   Size:', stats.size, 'bytes');
  console.log('   Modified:', stats.mtime);
} else {
  console.error('   ❌ Map file not found!');
  process.exit(1);
}

// Test tile calculations
console.log('\n🧮 Testing tile calculations...');
const MAP_SIZE = 2048;
const TILE_SIZE = 256;

for (let z = 0; z <= 4; z++) {
  const tilesPerSide = Math.pow(2, z);
  const tileMapSize = MAP_SIZE / tilesPerSide;
  console.log(`\n   Zoom level ${z}:`);
  console.log(`     Tiles per side: ${tilesPerSide}`);
  console.log(`     Tile map size: ${tileMapSize}px`);
  console.log(`     Total tiles: ${tilesPerSide * tilesPerSide}`);
  
  // Test first tile
  if (tilesPerSide > 0) {
    const x = 0;
    const y = 0;
    const sourceX = x * tileMapSize;
    const sourceY = y * tileMapSize;
    const left = Math.max(0, Math.floor(sourceX));
    const top = Math.max(0, Math.floor(sourceY));
    const right = Math.min(MAP_SIZE, Math.ceil(sourceX + tileMapSize));
    const bottom = Math.min(MAP_SIZE, Math.ceil(sourceY + tileMapSize));
    const width = right - left;
    const height = bottom - top;
    
    console.log(`     First tile (0,0):`);
    console.log(`       Source: (${sourceX}, ${sourceY})`);
    console.log(`       Extract: left=${left}, top=${top}, width=${width}, height=${height}`);
  }
}

console.log('\n✅ Test complete!');
console.log('📝 Next steps:');
console.log('   1. Start your Next.js dev server');
console.log('   2. Open the battlefield page');
console.log('   3. Check browser console for tile requests');
console.log('   4. Check server console for API logs');






