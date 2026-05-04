const { client } = require('@gradio/client');
const fs = require('fs');

async function testGradio() {
  try {
    console.log("Connecting to Gradio space Wan-AI/Wan2.1...");
    const app = await client("Wan-AI/Wan2.1");
    console.log("Connected!");
    
    // We need to fetch an image or just pass a URL. Let's see API info.
    const apiInfo = await app.view_api();
    console.log("API Info:", JSON.stringify(apiInfo, null, 2));
  } catch(e) {
    console.error("Error:", e);
  }
}

testGradio();
