// Test chart endpoint with example data
import { fetchChartData, generateChartImage } from './chart-generator.js';
import { writeFileSync } from 'fs';

// Test with the example token identifier from user
const testTokenId = '023aae900224f23f1ee13f19737d2b409a01cdd5df459978a20657e0904c3332ff';

async function test() {
  console.log('Testing chart data fetch...');
  console.log(`Token ID: ${testTokenId.substring(0, 20)}...`);
  
  try {
    // Fetch chart data
    const chartData = await fetchChartData(testTokenId, 15, 24);
    console.log('\n✓ Chart data fetched successfully!');
    console.log(`  - Status: ${chartData.s}`);
    console.log(`  - Data points: ${chartData.t?.length || 0}`);
    
    if (chartData.t && chartData.t.length > 0) {
      console.log(`  - First timestamp: ${new Date(chartData.t[0] * 1000).toISOString()}`);
      console.log(`  - Last timestamp: ${new Date(chartData.t[chartData.t.length - 1] * 1000).toISOString()}`);
      console.log(`  - First close price: ${chartData.c[0]}`);
      console.log(`  - Last close price: ${chartData.c[chartData.c.length - 1]}`);
    }
    
    // Generate chart image
    console.log('\nGenerating chart image...');
    const chartImage = await generateChartImage(chartData, 'Test Token', null);
    
    // Save to file for inspection
    writeFileSync('test-chart.png', chartImage);
    console.log('✓ Chart image generated and saved as test-chart.png');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', error.response.data?.substring(0, 200));
    }
  }
}

test();






