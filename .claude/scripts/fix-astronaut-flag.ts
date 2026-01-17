#!/usr/bin/env npx tsx

/**
 * Fix the astronaut success image - make the flag solid white with green tick
 */

import * as fs from "fs";
import * as path from "path";
import { loadEnv } from "./lib/env";
import { generateImage } from "./lib/gemini";

loadEnv();

async function main() {
  const projectRoot = path.resolve(__dirname, "../..");

  // Read the current success image
  const imagePath = path.join(projectRoot, "public/images/astronaut/success.png");
  const imageBuffer = fs.readFileSync(imagePath);

  console.log("📷 Loaded reference image:", imagePath);
  console.log("📏 Image size:", imageBuffer.length, "bytes");

  const prompt = `Looking at this astronaut image, I need you to regenerate it with these specific changes:

1. Keep the overall composition, pose, and cute cartoon mascot style EXACTLY the same
2. The flag the astronaut is holding should be SOLID WHITE (currently it appears transparent/missing)
3. The checkmark/tick symbol on the flag should be BRIGHT GREEN
4. The astronaut spacesuit should remain white with the same style
5. Maintain the transparent background

This is a tech product mascot. Generate a new version that looks identical but with a clearly visible white flag and green checkmark.`;

  console.log("\n🎨 Generating fixed astronaut with white flag and green tick...\n");

  try {
    const result = await generateImage(prompt, {
      referenceImage: imageBuffer,
      referenceMimeType: "image/png",
    });

    const outputDir = path.join(projectRoot, "generated-images");
    const outputPath = path.join(outputDir, "astronaut-success-fixed.png");
    fs.writeFileSync(outputPath, result.image);

    console.log("✅ Generated:", outputPath);
    if (result.text) {
      console.log("\n📝 Gemini notes:", result.text);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
