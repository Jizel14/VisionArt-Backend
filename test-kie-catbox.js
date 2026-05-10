const fs = require("fs");

async function testKie() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const url = "https://files.catbox.moe/sx1x6w.png";

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
        image_urls: [url]
      }
    })
  });
  console.log(`Status: ${res.status}`);
  console.log(await res.text());
}
testKie();
