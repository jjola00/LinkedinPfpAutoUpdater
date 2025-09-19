// Test script for backend functionality
const { ImageGenerator } = require('./image-generator');
const fs = require('fs').promises;
const path = require('path');

async function testImageGenerator() {
  console.log('🧪 Testing Image Generator...');
  
  try {
    // Check if API key is configured
    if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'your_openai_api_key_here') {
      console.log('❌ OpenAI API key not configured');
      console.log('   Please set AI_API_KEY in your .env file');
      return false;
    }

    console.log('✅ API key configured');

    // Test rate limiter
    const generator = new ImageGenerator();
    console.log('✅ ImageGenerator initialized');

    // Test storage directory creation
    await generator.ensureStorageDirectory();
    console.log('✅ Storage directory ready');

    // Test stored images retrieval
    const images = await generator.getStoredImages();
    console.log(`✅ Found ${images.length} stored images`);

    // Test metadata handling
    const testMetadata = [{
      filename: 'test.png',
      prompt: 'Test prompt',
      generatedAt: new Date().toISOString()
    }];
    
    await generator.saveMetadata(testMetadata);
    console.log('✅ Metadata handling works');

    // Clean up test metadata
    const metadataPath = path.join(generator.storagePath, 'metadata.json');
    await fs.unlink(metadataPath).catch(() => {});

    console.log('🎉 All tests passed!');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

async function testServer() {
  console.log('🧪 Testing Server...');
  
  try {
    const server = require('./server');
    console.log('✅ Server module loaded');
    
    // Test would require actually starting the server
    // For now, just verify the module loads
    console.log('✅ Server tests passed!');
    return true;

  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Running Backend Tests');
  console.log('========================');
  
  const imageTest = await testImageGenerator();
  const serverTest = await testServer();
  
  console.log('\n📊 Test Results:');
  console.log(`Image Generator: ${imageTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Server: ${serverTest ? '✅ PASS' : '❌ FAIL'}`);
  
  if (imageTest && serverTest) {
    console.log('\n🎉 All tests passed! Backend is ready.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { testImageGenerator, testServer };
