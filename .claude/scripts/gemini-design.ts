#!/usr/bin/env npx tsx

/**
 * Gemini UI Design Agent
 *
 * Generates Voyager UI components using Gemini Flash.
 * Used by the /design skill.
 *
 * Usage: npx tsx gemini-design.ts <component_type> "<context>"
 */

import { loadEnv } from "./lib/env";
import { generateText } from "./lib/gemini";
import { UI_DESIGN_SYSTEM_PROMPT } from "./lib/voyager-aesthetic";

// Load environment
loadEnv();

interface DesignRequest {
  componentType: string;
  context: string;
}

interface DesignResponse {
  componentCode: string;
  designRationale: string;
  illustrationSuggestion: string;
  variants: string;
  rawResponse: string;
}

async function generateComponent(request: DesignRequest): Promise<DesignResponse> {
  const userPrompt = `Design a ${request.componentType} component for Voyager.

CONTEXT:
${request.context}

OUTPUT FORMAT (use these exact headers):

## COMPONENT CODE
\`\`\`tsx
// Full React component code here
\`\`\`

## DESIGN RATIONALE
Why you made these design choices, referencing the Voyager design system.

## ILLUSTRATION SUGGESTION
ASCII art, box-drawing patterns, or SVG concepts that could enhance this component.

## VARIANTS
If this component needs variants (sizes, states, themes), describe them with code snippets.`;

  const result = await generateText(userPrompt, {
    systemPrompt: UI_DESIGN_SYSTEM_PROMPT,
    temperature: 0.7,
  });

  const rawResponse = result.text;

  // Parse the structured response
  const componentCodeMatch = rawResponse.match(/## COMPONENT CODE\s*```tsx\s*([\s\S]*?)```/);
  const designRationaleMatch = rawResponse.match(/## DESIGN RATIONALE\s*([\s\S]*?)(?=## |$)/);
  const illustrationMatch = rawResponse.match(/## ILLUSTRATION SUGGESTION\s*([\s\S]*?)(?=## |$)/);
  const variantsMatch = rawResponse.match(/## VARIANTS\s*([\s\S]*?)(?=## |$)/);

  return {
    componentCode: componentCodeMatch?.[1]?.trim() || "",
    designRationale: designRationaleMatch?.[1]?.trim() || "",
    illustrationSuggestion: illustrationMatch?.[1]?.trim() || "",
    variants: variantsMatch?.[1]?.trim() || "",
    rawResponse,
  };
}

function printHelp(): void {
  console.log(`
🎨 Gemini UI Design Agent

Usage:
  npx tsx gemini-design.ts <component_type> "<context>"

Examples:
  npx tsx gemini-design.ts button "primary action for approving drafts"
  npx tsx gemini-design.ts card "knowledge node preview"
  npx tsx gemini-design.ts modal "confirmation dialog"
  npx tsx gemini-design.ts element "loading spinner"
  npx tsx gemini-design.ts interface "settings panel"

The component type can be:
  - button, card, modal, input, select, etc. (specific components)
  - element (small UI pieces like badges, spinners)
  - interface (larger compositions)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(args.length < 2 ? 1 : 0);
  }

  const componentType = args[0];
  const context = args.slice(1).join(" ");

  console.log(`\n🎨 Designing ${componentType}...\n`);
  console.log(`Context: ${context}\n`);
  console.log("─".repeat(60));

  try {
    const result = await generateComponent({ componentType, context });

    console.log("\n## COMPONENT CODE\n");
    console.log("```tsx");
    console.log(result.componentCode);
    console.log("```\n");

    console.log("## DESIGN RATIONALE\n");
    console.log(result.designRationale);
    console.log();

    console.log("## ILLUSTRATION SUGGESTION\n");
    console.log(result.illustrationSuggestion);
    console.log();

    console.log("## VARIANTS\n");
    console.log(result.variants);
    console.log();

    console.log("─".repeat(60));
    console.log("\n✅ Design complete. Review above and integrate into codebase.\n");

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
