
import { Client } from "@gradio/client";

async function testPredict() {
  try {
    const hfToken = process.env.HUGGINGFACE_API_KEY;
    console.log("Connecting to Wan2.1...");
    const app = await Client.connect("Wan-AI/Wan2.1", { hf_token: hfToken });
    
    console.log("Submitting t2v_generation_async via predict...");
    const result = await app.predict("/t2v_generation_async", [
        "A cat running in the garden", // prompt
        "1280*720", // resolution
        false, // watermark
        -1, // seed
    ]);
    
    console.log("Predict finished!");
    console.log("Result Data:", JSON.stringify(result.data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}

testPredict();
