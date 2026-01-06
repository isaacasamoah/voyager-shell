#!/usr/bin/env npx tsx

/**
 * Remove white backgrounds from astronaut images
 * Converts white/near-white pixels to transparent
 */

import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const ASTRONAUT_DIR = path.join(process.cwd(), "public/images/astronaut");
const THRESHOLD = 240; // Pixels with R,G,B all above this become transparent

async function removeBackground(inputPath: string): Promise<void> {
  const filename = path.basename(inputPath);
  console.log(`Processing ${filename}...`);

  // Read image and get raw pixel data
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Process pixels: make white/near-white transparent
  const pixels = new Uint8Array(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // If pixel is white/near-white, make it transparent
    if (r > THRESHOLD && g > THRESHOLD && b > THRESHOLD) {
      pixels[i + 3] = 0; // Set alpha to 0
    }

    // Also handle light gray edges (anti-aliasing)
    const brightness = (r + g + b) / 3;
    if (brightness > 230) {
      // Fade out near-white pixels proportionally
      const alpha = Math.max(0, Math.min(255, (255 - brightness) * 10));
      pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    }
  }

  // Save back
  await sharp(Buffer.from(pixels), {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(inputPath);

  console.log(`  ✓ ${filename} - background removed`);
}

async function main(): Promise<void> {
  console.log("\n🎨 Removing white backgrounds from astronaut images\n");
  console.log("─".repeat(50));

  const files = fs.readdirSync(ASTRONAUT_DIR).filter((f) => f.endsWith(".png"));

  for (const file of files) {
    await removeBackground(path.join(ASTRONAUT_DIR, file));
  }

  console.log("─".repeat(50));
  console.log("\n✅ Done! All images now have transparent backgrounds.\n");
}

main().catch(console.error);
