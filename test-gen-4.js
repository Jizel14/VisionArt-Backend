const apiKey = process.env.GEMINI_API_KEY;

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`;
  console.log('Fetching', url.split('?key=')[0]);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt: "A futuristic cyberpunk city at night with neon signs" }],
      parameters: { sampleCount: 1 }
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Error:', data);
    return;
  }
  
  if (data.predictions && data.predictions.length > 0) {
      console.log('Success! Keys:', Object.keys(data.predictions[0]));
      console.log('MimeType:', data.predictions[0].mimeType);
      console.log('Length:', data.predictions[0].bytesBase64Encoded?.length);
  } else {
      console.log('Data:', JSON.stringify(data, null, 2));
  }
}

test();
