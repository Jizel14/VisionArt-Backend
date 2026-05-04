const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();
const apiKey = process.env.HUGGINGFACE_API_KEY;

if (!apiKey) {
  console.log("No HUGGINGFACE_API_KEY found in .env");
  process.exit(1);
}

const modelsToTest = [
  'stabilityai/stable-video-diffusion-img2vid-xt',
  'stabilityai/stable-video-diffusion-img2vid',
  'damo-vilab/text-to-video-ms-1.7b',
  'ByteDance/AnimateDiff-Lightning',
  'KwaiVGI/LiveCrafter',
  'ali-vilab/i2vgen-xl'
];

async function testModels() {
  for (const model of modelsToTest) {
    console.log(`Testing ${model}...`);
    try {
      const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: "A cat running on the grass" })
      });
      
      const text = await response.text();
      console.log(`Response for ${model}: ${response.status} - ${text.substring(0, 100)}`);
    } catch (e) {
      console.log(`Error testing ${model}: ${e.message}`);
    }
  }
}

testModels();
