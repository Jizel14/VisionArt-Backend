async function test() {
  const url = "https://tempfile.aiquickdraw.com/workers/nano/image_1778443401181_htmhrt.png";
  try {
    const res = await fetch(url);
    console.log("Status:", res.status);
    console.log("OK:", res.ok);
  } catch(e) {
    console.log("Error:", e);
  }
}
test();
