#!/usr/bin/env npx tsx

/**
 * Surgically remove white background from black-line astronaut images
 * Preserves all line detail and shading, only removes pure white
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const INPUT_DIR = path.join(process.cwd(), "generated-images");
const OUTPUT_DIR = path.join(process.cwd(), "public/images/astronaut");

// Only remove very white pixels (preserve gray shading)
const WHITE_THRESHOLD = 248;

async function removeWhiteBackground(inputPath: string, outputPath: string): Promise<void> {
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

    // Only remove pure white / near-white background
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      pixels[i + 3] = 0; // Fully transparent
    }
    // Smooth transition for near-white (anti-aliasing edges)
    else if (r >= 240 && g >= 240 && b >= 240) {
      const whiteness = (r + g + b) / 3;
      const alpha = Math.round((255 - whiteness) * (255 / (255 - 240)));
      pixels[i + 3] = Math.min(255, alpha);
    }
    // Keep everything else (grays, blacks) fully opaque
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

  console.log(`  ✓ Saved: ${path.basename(outputPath)}`);
}

async function main(): Promise<void> {
  console.log("\n🎨 Surgically removing white backgrounds\n");
  console.log("─".repeat(50));

  // Map original files to output names
  const mappings: [string, string][] = [
    ["astronaut-success-v4-flag.png", "success.png"],
    ["astronaut-searching.png", "searching.png"],
    ["astronaut-idle-v2.png", "idle.png"],
    ["astronaut-error.png", "error.png"],
    ["astronaut-listening-v2.png", "listening.png"],
    ["astronaut-celebrating.png", "celebrating.png"],
  ];

  for (const [input, output] of mappings) {
    const inputPath = path.join(INPUT_DIR, input);
    const outputPath = path.join(OUTPUT_DIR, output);

    if (fs.existsSync(inputPath)) {
      await removeWhiteBackground(inputPath, outputPath);
    } else {
      console.log(`  ⚠ ${input} not found`);
    }
  }

  console.log("─".repeat(50));
  console.log("\n✅ Done! Original line art preserved, white backgrounds removed.\n");
}

main().catch(console.error);
