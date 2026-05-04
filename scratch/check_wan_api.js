
import { Client } from "@gradio/client";

async function checkApi() {
  try {
    const app = await Client.connect("Wan-AI/Wan2.1");
    console.log("Connected to Wan2.1");
    
    // Check available endpoints
    // The client doesn't have a direct 'view_api' but we can inspect the config
    console.log("Endpoints:", Object.keys(app.config.dependencies).map(d => app.config.dependencies[d].api_name || `index ${d}`));
    
    // Print details of t2v related endpoints
    for (const dep of app.config.dependencies) {
        if (dep.api_name && (dep.api_name.includes("t2v") || dep.api_name.includes("gen") || dep.api_name.includes("status"))) {
            console.log(`\nEndpoint: ${dep.api_name}`);
            console.log(`Inputs:`, dep.inputs.length);
            console.log(`Outputs:`, dep.outputs.length);
        }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

checkApi();
