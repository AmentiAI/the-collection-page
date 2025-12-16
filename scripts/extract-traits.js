/**
 * Extract unique traits from inscription_prompts.json
 * 
 * This script parses the prompts and extracts all unique trait names + descriptions
 * organized by trait category (Head, Body Skin, Eyes, Mouth, Hands, Background)
 * 
 * Run with: node scripts/extract-traits.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'public', 'inscription_prompts.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'extracted_traits.json');

// Trait categories we care about
const TRAIT_CATEGORIES = ['Head', 'Body Skin', 'Eyes', 'Mouth', 'RIght Hand', 'Background'];

// Normalize trait category names
const normalizeCategory = (category) => {
  const cat = category.trim();
  // Handle "RIght Hand" typo in the data
  if (cat.toLowerCase().includes('hand')) return 'Hands';
  return cat;
};

function parseTraitsFromPrompt(prompt) {
  const traits = [];
  
  // Find the ASSIGNED TRAITS section
  const traitsMatch = prompt.match(/ASSIGNED TRAITS:\n([\s\S]*?)(?:\n\nTRAIT RENDERING|\n\nCUSTOM RULES|$)/i);
  if (!traitsMatch) return traits;
  
  const traitsSection = traitsMatch[1];
  const traitLines = traitsSection.split('\n').filter(line => line.trim());
  
  for (const line of traitLines) {
    // Match pattern: "Category: Name - Description"
    const match = line.match(/^([^:]+):\s*(.+?)\s*-\s*(.+)$/);
    if (match) {
      const category = match[1].trim();
      const name = match[2].trim();
      const description = match[3].trim();
      
      // Skip non-trait categories
      if (!TRAIT_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase() || 
          (category.toLowerCase().includes('hand') && c.toLowerCase().includes('hand')))) {
        continue;
      }
      
      traits.push({
        category: normalizeCategory(category),
        name,
        description
      });
    }
  }
  
  return traits;
}

function main() {
  console.log('📖 Reading inscription_prompts.json...');
  
  const inputData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`   Found ${inputData.length} inscriptions`);
  
  // Track unique traits by category
  const traitsByCategory = {};
  const traitLookup = {}; // Map of "category|name" -> trait object
  
  let totalTraitsParsed = 0;
  let inscriptionsWithTraits = 0;
  
  for (const inscription of inputData) {
    if (!inscription.prompt) continue;
    
    const traits = parseTraitsFromPrompt(inscription.prompt);
    if (traits.length > 0) {
      inscriptionsWithTraits++;
      totalTraitsParsed += traits.length;
      
      for (const trait of traits) {
        const key = `${trait.category}|${trait.name}`;
        
        // Only keep unique traits (first occurrence wins)
        if (!traitLookup[key]) {
          traitLookup[key] = trait;
          
          if (!traitsByCategory[trait.category]) {
            traitsByCategory[trait.category] = [];
          }
          traitsByCategory[trait.category].push({
            name: trait.name,
            description: trait.description
          });
        }
      }
    }
  }
  
  // Build the output structure
  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: 'inscription_prompts.json',
      totalInscriptions: inputData.length,
      inscriptionsWithTraits,
      totalTraitsParsed,
      uniqueTraitsCount: Object.keys(traitLookup).length
    },
    categories: {}
  };
  
  // Sort traits alphabetically within each category
  for (const [category, traits] of Object.entries(traitsByCategory)) {
    output.categories[category] = traits.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  // Also create a flat lookup map for quick access
  output.lookup = {};
  for (const [key, trait] of Object.entries(traitLookup)) {
    output.lookup[key] = trait.description;
  }
  
  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log('\n✅ Extraction complete!');
  console.log(`   Output: ${OUTPUT_FILE}`);
  console.log('\n📊 Summary:');
  console.log(`   Total inscriptions processed: ${inputData.length}`);
  console.log(`   Inscriptions with traits: ${inscriptionsWithTraits}`);
  console.log(`   Total trait occurrences parsed: ${totalTraitsParsed}`);
  console.log(`   Unique traits extracted: ${Object.keys(traitLookup).length}`);
  console.log('\n📁 Categories breakdown:');
  for (const [category, traits] of Object.entries(traitsByCategory).sort()) {
    console.log(`   ${category}: ${traits.length} unique traits`);
  }
  
  // Also output file size comparison
  const inputSize = fs.statSync(INPUT_FILE).size;
  const outputSize = fs.statSync(OUTPUT_FILE).size;
  console.log('\n💾 File sizes:');
  console.log(`   inscription_prompts.json: ${(inputSize / 1024).toFixed(1)} KB`);
  console.log(`   extracted_traits.json: ${(outputSize / 1024).toFixed(1)} KB`);
  console.log(`   Reduction: ${((1 - outputSize / inputSize) * 100).toFixed(1)}%`);
}

main();

