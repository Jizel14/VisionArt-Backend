async function test() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const url1 = "https://d.uguu.se/QarKbEVk.png";
  const url2 = "https://upload.wikimedia.org/wikipedia/commons/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg";

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
        image_urls: [url1, url2]
      }
    })
  });
  console.log(`Create Status: ${res.status}`);
  const json = await res.json();
  console.log(json);
}
test();
