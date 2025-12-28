#!/usr/bin/env npx ts-node

/**
 * Gemini Design Agent
 *
 * Calls Gemini Flash to generate retro console-style UI components.
 * Used by the /design skill.
 *
 * Usage: npx ts-node gemini-design.ts <component_type> <context>
 *
 * Requires GEMINI_API_KEY environment variable.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

const DESIGN_SYSTEM_PROMPT = `You are a UI designer specializing in retro console aesthetics with modern usability.

VOYAGER DESIGN SYSTEM:

Aesthetic Principles:
- Console/terminal feel: monospace hints, command-line energy, typewriter rhythm
- Retro computing: phosphor glow effects, CRT warmth, vintage computing nostalgia
- Nautical touches: brass accents, maritime instrument inspiration, captain's quarters warmth
- Beautiful details: subtle gradients, box-drawing characters (─│┌┐└┘├┤┬┴┼), ASCII art flourishes

Color Palette:
- Terminal Green: #33ff33 (primary actions, success states)
- Amber Glow: #ffb000 (warnings, highlights, warmth)
- Phosphor Blue: #00ffff (links, interactive elements)
- Deep Ocean: #0a1628 (backgrounds, depth)
- Brass: #b5a642 (accents, premium feel)
- Parchment: #f4ecd8 (text backgrounds, cards)

Typography:
- Monospace for data, commands, code: 'JetBrains Mono', 'Fira Code', monospace
- Clean sans for body text: 'Inter', system-ui
- Optional display: 'Space Grotesk' for headers

UI Patterns:
- Borders: Use box-drawing characters or subtle 1px borders
- Glow effects: Subtle drop-shadow with terminal-green or amber for focus states
- Hover states: Slight brightness increase, optional scanline effect
- Cards: Parchment background with subtle inset shadow, brass corner accents
- Buttons: Terminal-style with bracket hints [ Action ] or solid with glow

Technical Requirements:
- React functional component with TypeScript
- Tailwind CSS for styling (extend theme for custom colors)
- Accessible (WCAG AA minimum)
- Responsive (mobile-first)
- Named exports only (no default exports)
- Props interface defined above component
- Arrow function components`;

async function callGemini(request: DesignRequest): Promise<DesignResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable not set");
  }

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
If this component needs variants (sizes, states, themes), describe them.`;

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: DESIGN_SYSTEM_PROMPT },
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

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

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: npx ts-node gemini-design.ts <component_type> <context>");
    console.error("Example: npx ts-node gemini-design.ts button 'primary action for approving drafts'");
    process.exit(1);
  }

  const componentType = args[0];
  const context = args.slice(1).join(" ");

  console.log(`\n🎨 Designing ${componentType}...\n`);
  console.log(`Context: ${context}\n`);
  console.log("─".repeat(60));

  try {
    const result = await callGemini({ componentType, context });

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
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
