/**
 * Build slim collection metadata from generated_ordinals.json
 * 
 * This creates a much smaller JSON file for the homepage that only contains
 * the data needed for display (no prompts, no base64, minimal fields)
 * 
 * Run with: node scripts/build-collection-metadata.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'public', 'generated_ordinals.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'collection_metadata.json');
const INSCRIPTION_PROMPTS_FILE = path.join(__dirname, '..', 'public', 'inscription_prompts.json');

function main() {
  console.log('📖 Reading generated_ordinals.json...');
  
  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`   Found ${inputData.length} ordinals`);

  // Also load inscription_prompts.json to get the inscription_id -> prompt mapping
  // This maps inscription_id to the actual minted inscriptions
  let inscriptionIdMap = {};
  try {
    const promptsData = JSON.parse(fs.readFileSync(INSCRIPTION_PROMPTS_FILE, 'utf8'));
    console.log(`   Found ${promptsData.length} inscription prompts`);
    
    // Build a set of inscription IDs that are minted
    for (const item of promptsData) {
      if (item.inscription_id) {
        inscriptionIdMap[item.inscription_id] = {
          image_url: item.image_url,
          thumbnail_url: item.thumbnail_url || item.image_info?.thumbnail_url
        };
      }
    }
    console.log(`   Mapped ${Object.keys(inscriptionIdMap).length} minted inscriptions`);
  } catch (e) {
    console.log('   No inscription_prompts.json found, skipping inscription mapping');
  }

  // Build slim ordinals data
  const slimOrdinals = inputData.map((ordinal, index) => {
    // Extract only the data needed for homepage display
    const slim = {
      id: ordinal.id,
      // Use inscription_id if available, otherwise use internal id
      inscription_id: ordinal.inscription_id || null,
      // Images - prefer thumbnail for gallery, full image for modal
      thumbnail_url: ordinal.thumbnail_url,
      image_url: ordinal.image_url,
      // Traits - simplified structure with just name (description available in extracted_traits.json)
      traits: {}
    };

    // Simplify traits to just the name (descriptions are in extracted_traits.json)
    if (ordinal.traits) {
      for (const [category, trait] of Object.entries(ordinal.traits)) {
        if (trait && trait.name) {
          slim.traits[category] = trait.name;
        }
      }
    }

    return slim;
  });

  // Also extract all unique trait names per category for filter building
  const traitsByCategory = {};
  for (const ordinal of slimOrdinals) {
    for (const [category, traitName] of Object.entries(ordinal.traits)) {
      if (!traitsByCategory[category]) {
        traitsByCategory[category] = new Set();
      }
      traitsByCategory[category].add(traitName);
    }
  }

  // Convert Sets to sorted arrays
  const filterOptions = {};
  for (const [category, traits] of Object.entries(traitsByCategory)) {
    filterOptions[category] = Array.from(traits).sort();
  }

  // Build output structure
  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      totalOrdinals: slimOrdinals.length,
      version: '1.0'
    },
    // Filter options pre-computed for Filters component
    filterOptions,
    // The actual ordinal data
    ordinals: slimOrdinals
  };

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  
  // Also create a pretty-printed version for debugging
  const prettyOutput = path.join(__dirname, '..', 'public', 'collection_metadata.pretty.json');
  fs.writeFileSync(prettyOutput, JSON.stringify(output, null, 2));

  // Calculate sizes
  const inputSize = fs.statSync(INPUT_FILE).size;
  const outputSize = fs.statSync(OUTPUT_FILE).size;
  
  console.log('\n✅ Build complete!');
  console.log(`   Output: ${OUTPUT_FILE}`);
  
  console.log('\n📊 Summary:');
  console.log(`   Total ordinals: ${slimOrdinals.length}`);
  console.log(`   Filter categories: ${Object.keys(filterOptions).length}`);
  for (const [cat, traits] of Object.entries(filterOptions)) {
    console.log(`     - ${cat}: ${traits.length} options`);
  }
  
  console.log('\n💾 File sizes:');
  console.log(`   generated_ordinals.json: ${(inputSize / 1024).toFixed(1)} KB`);
  console.log(`   collection_metadata.json: ${(outputSize / 1024).toFixed(1)} KB`);
  console.log(`   Reduction: ${((1 - outputSize / inputSize) * 100).toFixed(1)}%`);
}

main();

