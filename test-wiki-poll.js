async function test() {
  const apiKey = "8aa66ac285da8b5ae97b87af133ad4b7";
  const taskId = "2ea71c986aefab5e03825c22f2d83ed3";
  const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  console.log(await res.json());
}
test();
