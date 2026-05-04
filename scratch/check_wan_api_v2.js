
import { Client } from "@gradio/client";

async function checkApi() {
  try {
    const app = await Client.connect("Wan-AI/Wan2.1");
    console.log("Connected to Wan2.1");
    
    const t2vDep = app.config.dependencies.find(d => d.api_name === "t2v_generation_async");
    if (t2vDep) {
        console.log("\nt2v_generation_async details:");
        console.log(JSON.stringify(t2vDep, null, 2));
    }

    const statusDep = app.config.dependencies.find(d => d.api_name === "status_refresh");
    if (statusDep) {
        console.log("\nstatus_refresh details:");
        console.log(JSON.stringify(statusDep, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

checkApi();
