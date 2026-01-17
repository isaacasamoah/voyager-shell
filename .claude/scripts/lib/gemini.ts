/**
 * Gemini API Client
 *
 * Unified interface for Gemini text and image generation.
 */

import { requireEnv } from "./env";

const GEMINI_MODELS = {
  flash: "gemini-2.0-flash",
  flashExp: "gemini-2.0-flash-exp",
} as const;

type GeminiModel = keyof typeof GEMINI_MODELS;

interface TextGenerationOptions {
  model?: GeminiModel;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ImageGenerationOptions {
  temperature?: number;
  referenceImage?: Buffer;  // Pass an existing image as reference
  referenceMimeType?: string;
}

interface TextResponse {
  text: string;
  raw: unknown;
}

interface ImageResponse {
  image: Buffer;
  mimeType: string;
  text?: string;
  raw: unknown;
}

function getApiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * Generate text with Gemini
 */
export async function generateText(
  prompt: string,
  options: TextGenerationOptions = {}
): Promise<TextResponse> {
  const apiKey = requireEnv("GOOGLE_GEMINI_API_KEY");
  const model = GEMINI_MODELS[options.model || "flash"];
  const url = `${getApiUrl(model)}?key=${apiKey}`;

  const contents = [];

  if (options.systemPrompt) {
    contents.push({
      role: "user",
      parts: [{ text: options.systemPrompt }]
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: prompt }]
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return { text, raw: data };
}

/**
 * Generate an image with Gemini 2.0 Flash
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<ImageResponse> {
  const apiKey = requireEnv("GOOGLE_GEMINI_API_KEY");
  const model = GEMINI_MODELS.flashExp; // Image gen requires experimental model
  const url = `${getApiUrl(model)}?key=${apiKey}`;

  // Build parts array - include reference image if provided
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (options.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: options.referenceMimeType || "image/png",
        data: options.referenceImage.toString("base64"),
      }
    });
    parts.push({ text: prompt });
  } else {
    parts.push({ text: `Generate an image: ${prompt}` });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts,
      }],
      generationConfig: {
        responseModalities: ["image", "text"],
        temperature: options.temperature ?? 1.0,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const responseParts = data.candidates?.[0]?.content?.parts || [];

  let image: Buffer | undefined;
  let mimeType = "image/png";
  let text: string | undefined;

  for (const part of responseParts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      image = Buffer.from(part.inlineData.data, "base64");
      mimeType = part.inlineData.mimeType;
    }
    if (part.text) {
      text = part.text;
    }
  }

  if (!image) {
    throw new Error("No image generated. Gemini response: " + (text || "empty"));
  }

  return { image, mimeType, text, raw: data };
}
