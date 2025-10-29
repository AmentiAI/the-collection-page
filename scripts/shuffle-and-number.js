const fs = require('fs');
const path = require('path');

// Paths
const ordinalsFile = path.join(__dirname, '../public/generated_ordinals.json');

console.log('Reading ordinals file...');
const ordinals = JSON.parse(fs.readFileSync(ordinalsFile, 'utf8'));

console.log(`Loaded ${ordinals.length} ordinals`);

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

console.log('Shuffling ordinals...');
const shuffled = shuffleArray(ordinals);

console.log('Numbering ordinals...');
// Replace id with sequential number starting from 1
const numbered = shuffled.map((ordinal, index) => {
  return {
    ...ordinal,
    id: (index + 1).toString(), // Number as string starting from 1
  };
});

// Write updated file
console.log(`Writing shuffled and numbered ordinals to ${ordinalsFile}...`);
fs.writeFileSync(ordinalsFile, JSON.stringify(numbered, null, 2), 'utf8');

console.log('✅ Shuffle and numbering complete!');
console.log(`   - Total ordinals: ${numbered.length}`);
console.log(`   - IDs range: 1 to ${numbered.length}`);

