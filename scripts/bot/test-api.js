// Test script to explore Luminex API endpoints and responses
import axios from 'axios';

const LUMINEX_API_URL = 'https://api.luminex.io/spark';

// Test 1: Fetch pools endpoint
async function testPoolsEndpoint() {
  console.log('\n=== Testing Pools Endpoint ===');
  try {
    const res = await axios.get(
      `${LUMINEX_API_URL}/tokens-with-pools?offset=0&limit=5&sort_by=agg_volume_24h_usd&order=desc`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );
    
    const data = res.data;
    const tokens = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    
    if (tokens.length > 0) {
      console.log(`✓ Found ${tokens.length} tokens`);
      const firstToken = tokens[0];
      console.log('\nFirst token structure:');
      console.log(JSON.stringify(firstToken, null, 2));
      
      // Check for pool_lp_pubkey
      if (firstToken.pools && firstToken.pools.length > 0) {
        console.log('\n✓ Pool found:');
        console.log(JSON.stringify(firstToken.pools[0], null, 2));
        return firstToken.pools[0].lp_pubkey || firstToken.pools[0].pubkey;
      } else if (firstToken.pool_lp_pubkey) {
        console.log('\n✓ pool_lp_pubkey found:', firstToken.pool_lp_pubkey);
        return firstToken.pool_lp_pubkey;
      }
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', error.response.data);
    }
  }
  return null;
}

// Test 2: Fetch comments endpoint
async function testCommentsEndpoint(poolLpPubkey) {
  if (!poolLpPubkey) {
    console.log('\n=== Skipping Comments Endpoint (no pool_lp_pubkey) ===');
    return;
  }
  
  console.log('\n=== Testing Comments Endpoint ===');
  console.log(`Using pool_lp_pubkey: ${poolLpPubkey.substring(0, 20)}...`);
  
  try {
    const res = await axios.get(
      `${LUMINEX_API_URL}/spark-comments?pool_lp_pubkey=${poolLpPubkey}&limit=5&offset=0`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );
    
    console.log('✓ Comments endpoint response:');
    console.log(JSON.stringify(res.data, null, 2));
    
    if (res.data?.data && res.data.data.length > 0) {
      console.log(`\n✓ Found ${res.data.data.length} comments`);
      console.log('\nFirst comment structure:');
      console.log(JSON.stringify(res.data.data[0], null, 2));
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Data:', error.response.data);
    }
  }
}

// Test 3: Try to find a single token endpoint
async function testSingleTokenEndpoint(poolLpPubkey) {
  if (!poolLpPubkey) {
    console.log('\n=== Skipping Single Token Endpoint Test ===');
    return;
  }
  
  console.log('\n=== Testing Single Token Endpoint (various attempts) ===');
  
  const endpointsToTry = [
    `${LUMINEX_API_URL}/token?pool_lp_pubkey=${poolLpPubkey}`,
    `${LUMINEX_API_URL}/pool/${poolLpPubkey}`,
    `${LUMINEX_API_URL}/pools/${poolLpPubkey}`,
    `${LUMINEX_API_URL}/token/${poolLpPubkey}`,
  ];
  
  for (const endpoint of endpointsToTry) {
    try {
      console.log(`\nTrying: ${endpoint}`);
      const res = await axios.get(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 5000,
      });
      
      console.log('✓ Found endpoint! Response:');
      console.log(JSON.stringify(res.data, null, 2));
      return endpoint;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('  → 404 Not Found');
      } else if (error.response?.status === 403) {
        console.log('  → 403 Forbidden (Cloudflare)');
      } else {
        console.log(`  → ${error.message}`);
      }
    }
  }
  
  console.log('\n✗ No single token endpoint found');
  return null;
}

// Main test runner
async function main() {
  console.log('Luminex API Endpoint Explorer');
  console.log('================================\n');
  
  const poolLpPubkey = await testPoolsEndpoint();
  await testCommentsEndpoint(poolLpPubkey);
  await testSingleTokenEndpoint(poolLpPubkey);
  
  console.log('\n=== Test Complete ===');
}

main().catch(console.error);






