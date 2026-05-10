const fs = require("fs");
require("dotenv").config();

async function testKie() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const rawPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  try {
    const res = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/nano-banana-edit",
        input: {
          prompt: "make it a van gogh painting",
          image_urls: [rawPng]
        }
      })
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(text);
  } catch(e) {
    console.log(`❌ ERROR: ${e.message}`);
  }
}
testKie();
