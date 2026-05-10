async function test() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const url = "https://d.uguu.se/QarKbEVk.png";

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
  console.log(`Create Status: ${res.status}`);
  const json = await res.json();
  console.log(json);

  if (json.code === 200 && json.data && json.data.taskId) {
     const taskId = json.data.taskId;
     let delayMs = 2000;
     for(let i=0; i<6; i++) {
       const pollRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
         headers: { Authorization: `Bearer ${apiKey}` }
       });
       const pollJson = await pollRes.json();
       console.log(`Poll state: ${pollJson.data?.state}`);
       if (pollJson.data?.state === 'success' || pollJson.data?.state === 'fail') {
          console.log(pollJson);
          break;
       }
       await new Promise(r => setTimeout(r, delayMs));
     }
  }
}
test();
