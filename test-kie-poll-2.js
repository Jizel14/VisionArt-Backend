const fs = require("fs");

async function testKie() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const taskId = "c84a539e56554d9431bc6fdc393270d7";
  
  const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const json = await res.json();
  console.log(json);
}
testKie();
