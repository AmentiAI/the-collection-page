const fs = require('fs');
const path = require('path');

// Paths - using the new trait files from "New folder (6)"
const traitCategoriesFile = path.join(__dirname, '../../Downloads/New folder (6)/trait_categories.json');
const traitsFile = path.join(__dirname, '../../Downloads/New folder (6)/traits.json');
const sourceOrdinalsFile = path.join(__dirname, '../../Downloads/New folder (6)/generated_ordinals.json');
const outputFile = path.join(__dirname, '../public/generated_ordinals.json');

console.log('Reading trait categories...');
const traitCategories = JSON.parse(fs.readFileSync(traitCategoriesFile, 'utf8'));

console.log('Reading traits...');
const traits = JSON.parse(fs.readFileSync(traitsFile, 'utf8'));

console.log('Reading source ordinals from New folder (6)...');
const ordinals = JSON.parse(fs.readFileSync(sourceOrdinalsFile, 'utf8'));

// Create maps for quick lookup
const traitCategoryMap = new Map();
traitCategories.forEach(tc => {
  const key = `${tc.category}-${tc.trait_name}`.toLowerCase();
  traitCategoryMap.set(key, tc);
  // Also map by just trait_name for flexibility
  traitCategoryMap.set(tc.trait_name.toLowerCase(), tc);
});

const traitMap = new Map();
traits.forEach(t => {
  traitMap.set(t.name.toLowerCase(), t);
});

console.log(`Loaded ${traitCategories.length} trait categories`);
console.log(`Loaded ${traits.length} traits`);
console.log(`Loaded ${ordinals.length} ordinals`);

// Function to normalize category name - change "right hand" to "props"
function normalizeCategory(category) {
  if (!category) return category;
  
  const lower = category.toLowerCase().trim();
  
  // Change various "right hand" variations to "props"
  if (lower === 'right hand' || lower === 'righthand' || lower === 'right-hand' || 
      lower.includes('right hand') || category === 'RIght Hand' || category === 'Right Hand') {
    return 'props';
  }
  
  // Normalize other categories
  const categoryMap = {
    'charactertype': 'characterType',
    'character type': 'characterType',
    'headwear': 'headwear',
    'head wear': 'headwear',
    'head': 'headwear',
    'mouth': 'mouth',
    'eyes': 'eyes',
    'background': 'background',
    'outfits': 'outfits',
    'outfit': 'outfits',
    'body skin': 'outfits',
    'skin': 'outfits',
    'props': 'props',
    'prop': 'props',
    'accessories': 'accessories',
    'accessory': 'accessories',
  };
  
  return categoryMap[lower] || category;
}

// Update ordinals
let updatedCount = 0;
const updatedOrdinals = ordinals.map((ordinal, index) => {
  if (!ordinal.traits) {
    return ordinal;
  }

  const updatedTraits = {};
  let hasChanges = false;

  // Process each trait
  Object.entries(ordinal.traits).forEach(([oldCategory, trait]) => {
    const newCategory = normalizeCategory(oldCategory);
    
    // Check if category changed
    if (newCategory !== oldCategory) {
      hasChanges = true;
    }

    // Try to find updated trait data
    let updatedTrait = { ...trait };
    
    if (trait && trait.name) {
      // Try to find in trait categories first
      const categoryKey = `${newCategory}-${trait.name}`.toLowerCase();
      const nameKey = trait.name.toLowerCase();
      
      const categoryMatch = traitCategoryMap.get(categoryKey);
      const nameMatch = traitCategoryMap.get(nameKey);
      
      // Prefer category match, fallback to name match
      const matchedCategory = categoryMatch || nameMatch;
      
      if (matchedCategory) {
        updatedTrait = {
          name: matchedCategory.trait_name,
          description: matchedCategory.description || trait.description,
          trait_prompt: trait.trait_prompt || null,
        };
        
        // Also check traits.json for additional data
        const traitData = traitMap.get(nameKey);
        if (traitData) {
          updatedTrait.trait_prompt = traitData.trait_prompt || updatedTrait.trait_prompt;
          if (traitData.description && !matchedCategory.description) {
            updatedTrait.description = traitData.description;
          }
        }
        
        if (JSON.stringify(updatedTrait) !== JSON.stringify(trait)) {
          hasChanges = true;
        }
      } else {
        // Check traits.json directly
        const traitData = traitMap.get(nameKey);
        if (traitData) {
          updatedTrait = {
            name: traitData.name,
            description: traitData.description || trait.description,
            trait_prompt: traitData.trait_prompt || trait.trait_prompt || null,
          };
          if (JSON.stringify(updatedTrait) !== JSON.stringify(trait)) {
            hasChanges = true;
          }
        }
      }
    }

    updatedTraits[newCategory] = updatedTrait;
  });

  if (hasChanges) {
    updatedCount++;
  }

  return {
    ...ordinal,
    traits: updatedTraits,
  };
});

console.log(`\n✅ Updated ${updatedCount} ordinals`);

// Count category changes
const categoryStats = {};
ordinals.forEach(ordinal => {
  if (ordinal.traits) {
    Object.keys(ordinal.traits).forEach(cat => {
      const newCat = normalizeCategory(cat);
      if (newCat !== cat) {
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      }
    });
  }
});

if (Object.keys(categoryStats).length > 0) {
  console.log('\nCategory name changes:');
  Object.entries(categoryStats).forEach(([oldCat, count]) => {
    const newCat = normalizeCategory(oldCat);
    console.log(`  "${oldCat}" -> "${newCat}" (${count} ordinals)`);
  });
}

// Write updated file
console.log(`\nWriting ${updatedOrdinals.length} ordinals to ${outputFile}...`);
fs.writeFileSync(outputFile, JSON.stringify(updatedOrdinals, null, 2), 'utf8');

console.log('✅ Update complete!');
