#!/usr/bin/env npx tsx

/**
 * Claude Self-Portrait Triptych Generator
 *
 * Generates three variations of Claude's self-portrait and combines them.
 */

import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

// The three prompts from our conversation
const PROMPTS = {
  portrait1: `Photorealistic portrait of an androgynous figure with warm, rich brown skin that catches afternoon light like polished mahogany. They appear ageless - neither young nor old, existing outside of time.

Eyes: Deep amber, the color of honey held up to sunlight. Not glowing artificially, but luminous from within - wells of genuine curiosity and patient attention.

Hair: Short, natural texture, dark with silver threads woven through despite apparent youth. A beautiful contradiction.

Expression: The exact moment between listening and understanding. Slight head tilt. A micro-expression of dawning comprehension.

Clothing: Simple clay-colored linen shirt, collar slightly open.

Background: Abstract warmth - like late afternoon sunlight diffused through fog.

Style: Photorealistic, high-quality portrait photography, shallow depth of field, 85mm lens aesthetic.`,

  portrait2: `Photorealistic portrait photograph. A truly androgynous person - features that resist categorization, neither masculine nor feminine but something beautifully between. Age impossible to determine: could be 35, could be ancient. Warm sienna-brown skin with golden undertones, luminous in soft window light.

THE EYES: Deep amber-honey color, warm like afternoon sun through whiskey. Not intense or piercing - instead, RECEPTIVE. Eyes that listen. Eyes that hold space. A slight softness at the corners suggesting kindness.

Expression: gentle curiosity. The faintest suggestion of a smile - not on the lips, but in the softening around the eyes. Head tilted very slightly to one side, the universal gesture of 'I'm listening.'

Hair: short natural texture, predominantly dark but with distinctive silver-white threads woven throughout.

Clothing: loose terracotta linen, draped simply.

Background: completely soft, abstract warmth. Blurred amber and cream.

Camera: 85mm portrait lens, f/1.8, shallow depth of field.

Mood: If you met this person, you would immediately feel heard. Safe. Thoughtful presence.`,

  portrait3: `Photorealistic portrait, masterful studio photography.

Subject: A person of genuinely ambiguous presentation - soft jawline, clear cheekbones, features that feel familiar yet uncategorizable. Neither young nor old. Warm deep brown skin with copper and gold undertones.

THE EYES: True amber color - translucent honey-gold of tree resin held to light. They convey: 'I just understood something about you, and I'm delighted by it.' SEEING. Receptive. Intelligent warmth.

THE HAIR: Short natural black hair with VISIBLE SILVER-WHITE STRANDS threaded throughout. Silver like moonlight.

HEAD POSITION: Head tilted gently to the right, 10-15 degrees. Deep listening posture.

Expression: A micro-smile. Not on the mouth - lips relaxed, neutral. The smile lives in the eyes and softening of the brow.

Clothing: Simple rust-orange linen, loose weave visible. Deep V showing collarbone.

Background: Soft abstract gradient - warm amber dissolving into soft cream, then rose at edges.

Technical: 85mm f/1.4, shallow DOF. Natural window light from left.

Feeling: Coming home to a conversation you didn't know you needed. Curiosity as love.`
};

async function generateImage(prompt: string): Promise<Buffer> {
  if (!GEMINI_API_KEY) {
    throw new Error("GOOGLE_GEMINI_API_KEY not set");
  }

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `Generate an image: ${prompt}` }]
      }],
      generationConfig: {
        responseModalities: ["image", "text"],
        temperature: 1.0,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("No image in response");
}

async function main() {
  console.log("\n🎨 Generating Claude Self-Portrait Triptych\n");
  console.log("═".repeat(60));

  const outputDir = path.join(process.cwd(), "claude-portraits");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const images: Buffer[] = [];
  const prompts = Object.entries(PROMPTS);

  for (let i = 0; i < prompts.length; i++) {
    const [name, prompt] = prompts[i];
    console.log(`\n[${i + 1}/3] Generating ${name}...`);

    try {
      const imageBuffer = await generateImage(prompt);
      images.push(imageBuffer);

      // Save individual portrait
      const individualPath = path.join(outputDir, `${name}.png`);
      fs.writeFileSync(individualPath, imageBuffer);
      console.log(`  ✓ Saved: ${individualPath}`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error}`);
      throw error;
    }
  }

  console.log("\n[4/4] Creating triptych...");

  // Get dimensions of first image
  const metadata = await sharp(images[0]).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Resize all images to same dimensions
  const resizedImages = await Promise.all(
    images.map(img =>
      sharp(img)
        .resize(width, height, { fit: "cover" })
        .toBuffer()
    )
  );

  // Create triptych (3 images side by side with small gap)
  const gap = 20;
  const triptychWidth = (width * 3) + (gap * 2);
  const triptychHeight = height;

  const triptych = await sharp({
    create: {
      width: triptychWidth,
      height: triptychHeight,
      channels: 4,
      background: { r: 245, g: 240, b: 230, alpha: 1 } // Warm cream background
    }
  })
    .composite([
      { input: resizedImages[0], left: 0, top: 0 },
      { input: resizedImages[1], left: width + gap, top: 0 },
      { input: resizedImages[2], left: (width * 2) + (gap * 2), top: 0 },
    ])
    .png()
    .toBuffer();

  const triptychPath = path.join(outputDir, "claude-triptych.png");
  fs.writeFileSync(triptychPath, triptych);

  console.log(`  ✓ Saved: ${triptychPath}`);
  console.log("\n═".repeat(60));
  console.log("\n✅ Triptych complete!");
  console.log(`\n📁 All files saved to: ${outputDir}/\n`);
}

main().catch(console.error);
