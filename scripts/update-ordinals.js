const fs = require('fs');
const path = require('path');

// Paths
const sourceFile = path.join(__dirname, '../../Downloads/updated ordinals/generated_ordinals.json');
const targetFile = path.join(__dirname, '../public/generated_ordinals.json');
const traitsFile = path.join(__dirname, '../../Downloads/updated ordinals/traits.json');

console.log('Reading source ordinals file...');
const sourceOrdinals = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));

console.log('Reading traits file for mapping...');
const allTraits = JSON.parse(fs.readFileSync(traitsFile, 'utf8'));

// Create a map of trait names to their full data
const traitMap = new Map();
allTraits.forEach(trait => {
  traitMap.set(trait.name, trait);
});

console.log(`Loaded ${sourceOrdinals.length} ordinals`);
console.log(`Loaded ${allTraits.length} traits`);

// Function to normalize category name
function normalizeCategory(category) {
  if (!category) return category;
  
  // Convert "Right Hand" variations to "Props"
  const lower = category.toLowerCase();
  if (lower.includes('right hand') || lower.includes('righthand') || category === 'RIght Hand') {
    return 'Props';
  }
  
  return category;
}

// Update each ordinal
let updatedCount = 0;
const updatedOrdinals = sourceOrdinals.map((ordinal, index) => {
  if (!ordinal.traits) {
    return ordinal;
  }

  const updatedTraits = {};
  let hasChanges = false;

  // Process each trait category
  Object.keys(ordinal.traits).forEach(oldCategory => {
    const newCategory = normalizeCategory(oldCategory);
    const trait = ordinal.traits[oldCategory];

    // If category changed
    if (newCategory !== oldCategory) {
      hasChanges = true;
      updatedTraits[newCategory] = trait;
    } else {
      updatedTraits[newCategory] = trait;
    }

    // Update trait data if we have newer data from traits.json
    if (trait && trait.name && traitMap.has(trait.name)) {
      const newTraitData = traitMap.get(trait.name);
      // Update with new data while preserving structure
      updatedTraits[newCategory] = {
        ...trait,
        description: newTraitData.description || trait.description,
        trait_prompt: newTraitData.trait_prompt || trait.trait_prompt,
      };
      if (newTraitData.description !== trait.description || newTraitData.trait_prompt !== trait.trait_prompt) {
        hasChanges = true;
      }
    }
  });

  if (hasChanges) {
    updatedCount++;
  }

  return {
    ...ordinal,
    traits: updatedTraits,
  };
});

console.log(`Updated ${updatedCount} ordinals with category changes or trait updates`);

// Count category changes
const categoryChanges = {};
sourceOrdinals.forEach(ordinal => {
  if (ordinal.traits) {
    Object.keys(ordinal.traits).forEach(cat => {
      const newCat = normalizeCategory(cat);
      if (newCat !== cat) {
        categoryChanges[cat] = newCat;
      }
    });
  }
});

if (Object.keys(categoryChanges).length > 0) {
  console.log('\nCategory name changes:');
  Object.entries(categoryChanges).forEach(([old, newCat]) => {
    console.log(`  "${old}" -> "${newCat}"`);
  });
}

// Write updated file
console.log(`\nWriting updated ordinals to ${targetFile}...`);
fs.writeFileSync(targetFile, JSON.stringify(updatedOrdinals, null, 2), 'utf8');

console.log('✅ Update complete!');

