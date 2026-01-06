#!/usr/bin/env npx tsx

/**
 * Remove black backgrounds from white-line astronaut images
 * Converts black/near-black pixels to transparent
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const INPUT_DIR = path.join(process.cwd(), "generated-images");
const OUTPUT_DIR = path.join(process.cwd(), "public/images/astronaut");
const THRESHOLD = 30; // Pixels with R,G,B all below this become transparent

async function removeBlackBackground(inputPath: string, outputPath: string): Promise<void> {
  const filename = path.basename(inputPath);
  console.log(`Processing ${filename}...`);

  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // If pixel is black/near-black, make it transparent
    if (r < THRESHOLD && g < THRESHOLD && b < THRESHOLD) {
      pixels[i + 3] = 0; // Set alpha to 0
    }

    // Fade out dark pixels proportionally for smooth edges
    const brightness = (r + g + b) / 3;
    if (brightness < 40) {
      const alpha = Math.max(0, Math.min(255, brightness * 6));
      pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    }
  }

  await sharp(Buffer.from(pixels), {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${filename} → ${path.basename(outputPath)}`);
}

async function main(): Promise<void> {
  console.log("\n🎨 Removing black backgrounds from white-line astronauts\n");
  console.log("─".repeat(50));

  const mappings = [
    ["astronaut-success-white.png", "success.png"],
    ["astronaut-searching-white.png", "searching.png"],
    ["astronaut-idle-white.png", "idle.png"],
    ["astronaut-error-white.png", "error.png"],
    ["astronaut-listening-white.png", "listening.png"],
    ["astronaut-celebrating-white.png", "celebrating.png"],
  ];

  for (const [input, output] of mappings) {
    const inputPath = path.join(INPUT_DIR, input);
    const outputPath = path.join(OUTPUT_DIR, output);

    if (fs.existsSync(inputPath)) {
      await removeBlackBackground(inputPath, outputPath);
    } else {
      console.log(`  ⚠ ${input} not found, skipping`);
    }
  }

  console.log("─".repeat(50));
  console.log("\n✅ Done! White-line astronauts ready.\n");
}

main().catch(console.error);
