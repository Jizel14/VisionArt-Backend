const fs = require("fs");
require("dotenv").config();

async function testCaption() {
  const url = 'https://router.huggingface.co/hf-inference/models/Salesforce/blip-image-captioning-large';
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const raw = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: raw }),
    });

    if (!response.ok) {
      console.log(`❌ FAILED: ${response.status} ${await response.text()}`);
      return;
    }
    const result = await response.json();
    console.log(`✅ SUCCESS! Caption:`, result);
  } catch(e) {
    console.log(`❌ ERROR: ${e.message}`);
  }
}
testCaption();
