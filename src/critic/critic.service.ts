import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ⚠️ IMPORTANT: CHANGER CETTE URL A CHAQUE SESSION GOOGLE COLAB ⚠️
// L'URL DOIT ETRE CELLE DE NGROK SUIVIE DE /generate
const COLAB_API_URL = "https://medicamental-jackqueline-distinguishingly.ngrok-free.dev/generate";
@Injectable()
export class CriticService {
    constructor(private configService: ConfigService) { }

    async generateArt(prompt: string, negativePrompt?: string): Promise<Buffer> {
        try {
            console.log(`Generating art via Google Colab API (${COLAB_API_URL})...`);
            
            const response = await fetch(COLAB_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, negative_prompt: negativePrompt || "" })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Colab API Error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            const base64String = data.base64;
            if (!base64String) {
                throw new Error("Python script returned empty output.");
            }
            return Buffer.from(base64String, 'base64');
        } catch (error) {
            console.error('Error generating art on Colab:', error);
            throw new HttpException(
                'Failed to generate art on Colab: ' + (error.message || 'Unknown error'),
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    async analyzeArt(imageUrl?: string, prompt?: string, imageBase64?: string): Promise<string> {
        const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
        if (!apiKey) {
            throw new HttpException(
                'Hugging Face API key is not configured.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }

        try {
            if (!imageUrl && !imageBase64) {
                throw new Error('No image provided');
            }

            const finalImageUrl = imageUrl || `data:image/png;base64,${imageBase64}`;

            // --- STEP 1: VISION (The eyes) ---
            // Use a dedicated image-to-text model (Captioning) which is much more stable on free tier
            console.log('Step 1: Extracting visual description (BLIP)...');
            let visualDescription = '';

            try {
                // We use a direct model endpoint for captioning (Image-to-Text task)
                const captionResponse = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ inputs: finalImageUrl })
                });

                if (captionResponse.ok) {
                    const captionData = await captionResponse.json();
                    visualDescription = captionData[0]?.generated_text || '';
                    console.log('Visual description obtained:', visualDescription);
                }
            } catch (e) {
                console.warn('Captioning failed, falling back to prompt-only analysis.');
            }

            // --- STEP 2: CRITIQUE (The brain) ---
            // Use a powerful text LLM to analyze the description and the user's intent
            console.log('Step 2: Generating artistic critique (Llama 3.1)...');
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'meta-llama/Llama-3.1-8B-Instruct',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional art critic and mentor. Analyze the provided description of an artwork and give a constructive 3-4 sentence critique addressing style, composition, and color.'
                        },
                        {
                            role: 'user',
                            content: `User Intention: ${prompt || 'Artistic exploration'}\nVisual Description: ${visualDescription || 'A digital creation'}.\n\nProvide a professional critique.`
                        }
                    ],
                    max_tokens: 300
                })
            });

            if (!response.ok) {
                throw new Error('Critique generation failed');
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || 'Feedback unavailable right now.';

        } catch (error) {
            console.error('AI Critic Error:', error);
            return "I'm currently observing other works in the gallery. Please try again in a moment for a full critique of your masterpiece!";
        }
    }

    async generateCaption(prompt: string): Promise<any> {
        const apiKey = this.configService.get<string>('HUGGINGFACE_API_KEY');
        if (!apiKey) {
            throw new HttpException('Hugging Face API key is not configured.', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        try {
            console.log('Step 3: Generating smart caption (Llama 3.1)...');
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'meta-llama/Llama-3.1-8B-Instruct',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a creative social media manager for an art gallery. Your goal is to write captions for AI-generated artworks. Return ONLY a valid JSON object with the following exact keys:
                            "title": (A short, artistic title),
                            "description": (A 1-2 sentence description highlighting the mood and style),
                            "tags": (An array of 4-6 relevant hashtags starting with #),
                            "phrase": (A short, catchy, inspiring phrase for social media)`
                        },
                        {
                            role: 'user',
                            content: `The artwork was generated with this prompt: "${prompt}". Generate the JSON output.`
                        }
                    ],
                    max_tokens: 300,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                throw new Error('Caption generation failed');
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (content) {
                try {
                    return JSON.parse(content);
                } catch (e) {
                    // Try to extract JSON if the LLM wrapped it in markdown
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        return JSON.parse(jsonMatch[0]);
                    }
                }
            }
            throw new Error("Invalid format received from LLM");
        } catch (error) {
            console.error('AI Caption Error:', error);
            return {
                title: "Artistic Creation",
                description: "A beautiful AI-generated masterpiece exploring new visual boundaries.",
                tags: ["#AIArt", "#DigitalCreation", "#VisionArt", "#Inspiration"],
                phrase: "Every prompt is a new universe. ✨"
            };
        }
    }
}
