#!/usr/bin/env npx tsx

/**
 * Gemini Image Generator
 *
 * Generate images with Gemini 2.0 Flash.
 * Used by the /imagine skill.
 *
 * Usage:
 *   npx tsx gemini-imagine.ts "a sunset over mountains"
 *   npx tsx gemini-imagine.ts --voyager "astronaut celebrating"
 *   npx tsx gemini-imagine.ts --astronaut success
 *   npx tsx gemini-imagine.ts --output custom-name.png "prompt here"
 */

import * as fs from "fs";
import * as path from "path";
import { loadEnv } from "./lib/env";
import { generateImage } from "./lib/gemini";
import { enhanceWithVoyagerStyle, getAstronautPrompt, VOYAGER_AESTHETIC } from "./lib/voyager-aesthetic";

// Load environment
loadEnv();

import { execSync } from "child_process";

interface Options {
  voyager: boolean;
  astronaut: string | null;
  terminal: boolean;
  transparent: boolean;
  output: string | null;
  prompt: string;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    voyager: false,
    astronaut: null,
    terminal: false,
    transparent: false,
    output: null,
    prompt: "",
  };

  const promptParts: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--voyager" || arg === "-v") {
      options.voyager = true;
    } else if (arg === "--terminal" || arg === "-t") {
      options.terminal = true;
      options.voyager = true;
    } else if (arg === "--astronaut" || arg === "-a") {
      i++;
      options.astronaut = args[i] || "idle";
      options.voyager = true;
    } else if (arg === "--transparent" || arg === "--rembg") {
      options.transparent = true;
    } else if (arg === "--output" || arg === "-o") {
      i++;
      options.output = args[i];
    } else if (!arg.startsWith("-")) {
      promptParts.push(arg);
    }

    i++;
  }

  options.prompt = promptParts.join(" ");
  return options;
}

function printHelp(): void {
  console.log(`
🎨 Gemini Image Generator

Usage:
  npx tsx gemini-imagine.ts [options] "prompt"

Options:
  --voyager, -v       Apply Voyager aesthetic to the prompt
  --terminal, -t      Terminal/console aesthetic (implies --voyager)
  --astronaut, -a     Generate Voyager astronaut in a state:
                      ${Object.keys(VOYAGER_AESTHETIC.astronaut.states).join(", ")}
  --transparent       Remove background with AI (rembg) - floating on transparent
  --output, -o        Custom output filename (default: auto-generated)

Examples:
  npx tsx gemini-imagine.ts "a serene mountain lake at dawn"
  npx tsx gemini-imagine.ts --voyager "futuristic control room"
  npx tsx gemini-imagine.ts --astronaut success
  npx tsx gemini-imagine.ts --transparent "a cute robot mascot"
  npx tsx gemini-imagine.ts --terminal "loading spinner animation concept"
  npx tsx gemini-imagine.ts -o hero.png "dramatic space scene"
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const options = parseArgs(args);

  if (!options.prompt && !options.astronaut) {
    console.error("❌ Error: No prompt provided");
    printHelp();
    process.exit(1);
  }

  // Build the final prompt
  let finalPrompt: string;

  if (options.astronaut) {
    const state = options.astronaut as keyof typeof VOYAGER_AESTHETIC.astronaut.states;
    if (!VOYAGER_AESTHETIC.astronaut.states[state]) {
      console.error(`❌ Unknown astronaut state: ${options.astronaut}`);
      console.error(`   Valid states: ${Object.keys(VOYAGER_AESTHETIC.astronaut.states).join(", ")}`);
      process.exit(1);
    }
    finalPrompt = getAstronautPrompt(state);
    console.log(`\n🧑‍🚀 Generating Voyager Astronaut: ${state}\n`);
  } else if (options.terminal) {
    finalPrompt = enhanceWithVoyagerStyle(options.prompt, "terminal");
    console.log(`\n🖥️  Generating with Terminal aesthetic\n`);
  } else if (options.voyager) {
    finalPrompt = enhanceWithVoyagerStyle(options.prompt, "general");
    console.log(`\n🚀 Generating with Voyager aesthetic\n`);
  } else {
    finalPrompt = options.prompt;
    console.log(`\n🎨 Generating image\n`);
  }

  console.log("Prompt:", finalPrompt.slice(0, 200) + (finalPrompt.length > 200 ? "..." : ""));
  console.log("\n" + "─".repeat(60) + "\n");

  try {
    const result = await generateImage(finalPrompt);

    // Determine output path
    const outputDir = path.join(process.cwd(), "generated-images");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = options.output || `image-${timestamp}.png`;
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, result.image);

    console.log("✅ Image generated successfully!");

    // Remove background if requested
    if (options.transparent) {
      console.log("\n🔍 Removing background with rembg...");
      try {
        execSync(`python3 -c "
from rembg import remove
from PIL import Image
input_img = Image.open('${outputPath}')
output_img = remove(input_img)
output_img.save('${outputPath}', 'PNG')
print('Background removed!')
"`, { stdio: 'inherit' });
        console.log("✅ Background removed - floating on transparent!");
      } catch (error) {
        console.warn("⚠️  rembg failed, keeping original image. Install with: pip3 install rembg");
      }
    }

    console.log(`📁 Saved to: ${outputPath}`);

    if (result.text) {
      console.log(`\n📝 Gemini's notes: ${result.text.slice(0, 200)}...`);
    }

    console.log();

  } catch (error) {
    console.error("❌ Error generating image:", error);
    process.exit(1);
  }
}

main();
