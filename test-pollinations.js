async function test() {
  const prompt = "A futuristic cyberpunk city at night with neon signs";
  const negativePrompt = "blurry, bad anatomy";
  let enhancedPrompt = prompt;
  if (negativePrompt) {
      enhancedPrompt += `. Highly detailed, masterpiece. No ${negativePrompt}`;
  }

  const encodedPrompt = encodeURIComponent(enhancedPrompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024`;

  console.log('Fetching URL:', url);
  const response = await fetch(url);

  if (!response.ok) {
    console.error('Error fetching image:', response.statusText);
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log('Success! Image size in bytes:', buffer.length);
}

test();
