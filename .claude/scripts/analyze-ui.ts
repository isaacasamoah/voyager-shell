#!/usr/bin/env npx tsx

/**
 * UI Analysis Script
 *
 * Sends VoyagerInterface to Gemini for UX refinement suggestions,
 * grounded in our design foundations.
 */

import { loadEnv } from "./lib/env";
import { generateText } from "./lib/gemini";
import * as fs from "fs";
import * as path from "path";

loadEnv();

const ANALYSIS_PROMPT = `You are a senior UI/UX designer reviewing a terminal-style chat interface.

## VOYAGER DESIGN FOUNDATIONS

**Vision:** "Voyager is your Jarvis. You are Ironman."
- Collaboration co-pilot that protects user attention
- Conversation as interface - NO navigation, no context switching
- Personal AI that learns you over time
- Make high-quality collaboration easy, careless collaboration hard

**The Metaphor (SACRED - do not break):**
- Terminal/console aesthetic - complete metaphor, not decoration
- The astronaut is Voyager's soul - shows emotional state (idle, searching, success, error)
- Context as environment variables
- Messages as conversation flow, not chat bubbles
- Commands with / prefix

**Color Palette:**
- Obsidian #050505 (background - not pure black)
- Surface #0A0A0A (elevated elements)
- Indigo #818cf8 (system accent, Voyager's color)
- Green #22c55e (success, approval, found)
- Amber #ffb000 (warmth, highlights, thinking)
- Slate-300 #cbd5e1 (primary text)
- Slate-500 #64748b (secondary text)

**Typography:**
- Monospace throughout (font-mono)
- text-xs for meta, text-sm for content
- tracking-wider for system labels

**Existing Patterns:**
- Borders: border-white/10
- Glows: shadow-[0_0_10px_rgba(...)]
- Hover: hover:bg-white/5
- Animations: animate-pulse for live states

**The Astronaut States:**
- idle: floating peacefully (default)
- searching: holding lantern, reaching for constellation graph
- success: planting checkmark flag triumphantly
- error: puzzled, looking at broken equipment
- listening: hand cupped to helmet
- celebrating: arms raised in triumph

## UX GOALS

1. **Intuitiveness** - New users should understand immediately
2. **Focus** - Nothing competes for attention unnecessarily
3. **Delight** - Small moments of beauty and personality
4. **Speed** - Feels instant, responsive
5. **Trust** - User always knows what's happening

## WHAT I WANT FROM YOU

Analyze the component code and suggest specific refinements for:

1. **Visual Hierarchy** - Is the most important thing most prominent?
2. **Whitespace & Rhythm** - Does it breathe? Is spacing consistent?
3. **Micro-interactions** - Hover states, transitions, feedback
4. **Loading States** - Are they informative and delightful?
5. **Empty States** - First-time experience, no messages yet
6. **Error States** - Graceful, helpful, on-brand
7. **Accessibility** - Color contrast, focus states, screen readers
8. **Mobile Considerations** - Does it work on smaller screens?

## OUTPUT FORMAT

For each suggestion:
1. **What:** Specific element or area
2. **Issue:** What's suboptimal
3. **Suggestion:** Concrete improvement
4. **Code Snippet:** Tailwind classes or small code change
5. **Priority:** High/Medium/Low

Focus on REFINEMENTS, not redesigns. We love what we have - we want to polish it.
Be specific. "Make it better" is not useful. "Add transition-colors duration-150 to the send button for smoother hover" is useful.

Limit to 10-15 highest impact suggestions.`;

async function analyzeUI() {
  // Read the main UI component
  const uiPath = path.join(process.cwd(), "components/ui/VoyagerInterface.tsx");
  const messageComponents = path.join(process.cwd(), "components/chat");

  let code = "";

  // Main component
  if (fs.existsSync(uiPath)) {
    code += `// === VoyagerInterface.tsx ===\n\n`;
    code += fs.readFileSync(uiPath, "utf-8");
  }

  // Message components
  const chatFiles = ["AssistantMessage.tsx", "UserMessage.tsx", "AstronautState.tsx"];
  for (const file of chatFiles) {
    const filePath = path.join(messageComponents, file);
    if (fs.existsSync(filePath)) {
      code += `\n\n// === ${file} ===\n\n`;
      code += fs.readFileSync(filePath, "utf-8");
    }
  }

  console.log("🔍 Analyzing Voyager UI...\n");
  console.log(`📄 Loaded ${code.split('\n').length} lines of code\n`);
  console.log("─".repeat(60));

  const result = await generateText(
    `${ANALYSIS_PROMPT}\n\n## COMPONENT CODE TO ANALYZE\n\n\`\`\`tsx\n${code}\n\`\`\``,
    {
      temperature: 0.7,
      maxTokens: 8000,
    }
  );

  console.log("\n" + result.text);
  console.log("\n" + "─".repeat(60));
  console.log("\n✅ Analysis complete. Review suggestions above.\n");
}

analyzeUI().catch(console.error);
