const fs = require("fs");
async function test() {
  const rawPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("file", new Blob([rawPng], {type: "image/png"}), "test.png");
  const res = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: form });
  const data = await res.json();
  console.log(data);
}
test();
