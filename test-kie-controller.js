const fs = require("fs");

async function testKie() {
  const rawPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  
  let contentPublicUrl = "failed";
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(rawPng)], {type: `image/png`}), "test.png");
    const uploadRes = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: form });
    const uploadData = await uploadRes.json();
    if (uploadData?.data?.url) {
      const urlParts = uploadData.data.url.split('tmpfiles.org/');
      contentPublicUrl = `https://tmpfiles.org/dl/${urlParts[1]}`;
      console.log(`Uploaded source image to tmpfiles.org for KIE: ${contentPublicUrl}`);
    } else {
      console.log("Upload failed", uploadData);
    }
  } catch (e) {
    console.log(`Failed to upload to tmpfiles.org: ${e}`);
  }

  // 2. Call KIE
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  console.log("Sending to KIE with URL:", contentPublicUrl);
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
        image_urls: [contentPublicUrl],
        output_format: "png",
        image_size: "auto"
      }
    })
  });
  console.log(`Status: ${res.status}`);
  console.log(await res.text());
}
testKie();
