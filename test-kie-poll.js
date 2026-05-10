const fs = require("fs");

async function testKie() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const taskId = "47a659308f73d3f10df574f902c3ee5f";
  
  let delayMs = 2000;
  for(let i=0; i<5; i++) {
    const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const json = await res.json();
    console.log(json);
    if(json.data?.state === 'success' || json.data?.state === 'fail') {
       break;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
}
testKie();
