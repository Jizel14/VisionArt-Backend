const fs = require("fs");
async function test() {
  const rawPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", new Blob([rawPng], {type: "image/png"}), "test.png");
  
  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
  const url = await res.text();
  console.log("Catbox URL:", url);
}
test();
