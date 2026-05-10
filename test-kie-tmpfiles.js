const fs = require("fs");

async function testKie() {
  const rawPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  
  // 1. Upload to tmpfiles.org
  const form = new FormData();
  form.append("file", new Blob([rawPng], {type: "image/png"}), "test.png");
  
  const uploadRes = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: form });
  const uploadData = await uploadRes.json();
  const urlParts = uploadData.data.url.split('tmpfiles.org/');
  const publicUrl = `https://tmpfiles.org/dl/${urlParts[1]}`;
  console.log("Uploaded to:", publicUrl);

  // 2. Call KIE
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
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
        image_urls: [publicUrl]
      }
    })
  });
  console.log(`Status: ${res.status}`);
  console.log(await res.text());
}
testKie();
