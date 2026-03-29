import sys
import base64
from io import BytesIO
import torch
from diffusers import StableDiffusionPipeline
import warnings

# Suppress warnings for cleaner stdout
warnings.filterwarnings("ignore")

def generate(prompt, negative_prompt=""):
    device = "cpu"
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"

    model_id = "runwayml/stable-diffusion-v1-5"
    
    dtype = torch.float16 if device in ["cuda", "mps"] else torch.float32
    pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=dtype)
    pipe = pipe.to(device)
    pipe.set_progress_bar_config(disable=True)
    
    image = pipe(prompt, negative_prompt=negative_prompt, num_inference_steps=30).images[0]
    
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    # Only print the base64 output
    print(img_str)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: prompt is required", file=sys.stderr)
        sys.exit(1)
        
    prompt = sys.argv[1]
    negative_prompt = sys.argv[2] if len(sys.argv) > 2 else ""
    
    try:
        generate(prompt, negative_prompt)
    except Exception as e:
        print(f"Failed to generate: {e}", file=sys.stderr)
        sys.exit(1)
