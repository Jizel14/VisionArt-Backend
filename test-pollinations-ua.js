async function test() {
  const prompt = "A futuristic cyberpunk city at night with neon signs";
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512`;

  console.log('Fetching URL:', url);
  const response = await fetch(url, {
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      }
  });

  if (!response.ok) {
    console.error('Error fetching image:', response.statusText, response.status);
    console.error(await response.text());
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log('Success! Image size in bytes:', buffer.length);
}

test();
