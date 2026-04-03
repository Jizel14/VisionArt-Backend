const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;

async function test() {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = "A cute anime girl";
  const enhancedPromptResponse = await model.generateContent(`Enhance this art prompt for an image generator (like Midjourney). Return ONLY the english prompt text, no intro/outro: ${prompt}`);
  
  const enhancedPrompt = enhancedPromptResponse.response.text().trim();
  console.log('Gemini Enhanced:', enhancedPrompt);

  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=512&height=512&nologo=true`;
  console.log('Pollinations URL:', imageUrl);
  
  const imgRes = await fetch(imageUrl);
  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log('Image fetched successfully! Size:', buffer.length);
}

test();
