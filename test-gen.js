const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyA_...'; // I will run this with the FAKE_KEY replacing or I will use user's env

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`;
  console.log('Fetching', url.substring(0, 100) + '...');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: "A cute fluffy cat",
        }
      ],
      parameters: {
        sampleCount: 1,
      }
    }),
  });

  if (!response.ok) {
    console.error('Error:', await response.text());
    return;
  }

  const data = await response.json();
  console.log('Success!', Object.keys(data));
  if (data.predictions && data.predictions.length > 0) {
      console.log('Prediction keys:', Object.keys(data.predictions[0]));
      console.log('Preview image bytes length:', data.predictions[0].bytesBase64Encoded?.length);
  } else {
      console.log('Data:', JSON.stringify(data, null, 2));
  }
}

test();
