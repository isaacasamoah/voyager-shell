# /design - Console UI Design Agent

Generate beautiful retro console-style UI components using Gemini Flash, then reason about and integrate them.

## Aesthetic Direction

**Terminal-Native Design System:**

The metaphor is COMPLETE, not decorative. Every element thinks in terminal logic.

**Core Patterns:**
- Context as environment variables: `$CTX: PROJECT_X`, `$GRP: #TEAM`
- Drafts as files: `DRAFT_RESPONSE.md`, `STANDUP.md`
- Input as command prompt: `➜ ~/project-x`
- Loading as process: `VOYAGER IS TRAVERSING...`
- Header as system bar: `VOYAGER_SHELL_v0.9 | contexts | ● LIVE`

**The Tracer Route (for showing work):**
- Visualize graph traversal as a vertical timeline
- Each step is a node with hover state
- "Found" nodes glow green with shadow
- Makes "slower, smarter" beautiful

**Color Palette (Validated):**
```
--obsidian: #050505        /* Background - not pure black */
--surface: #0A0A0A         /* Cards, elevated surfaces */
--indigo-400: #818cf8      /* System/Voyager accent */
--indigo-500/10: rgba()    /* Context variable backgrounds */
--green-500: #22c55e       /* Success, approval, found */
--green-900/20: rgba()     /* Approve button background */
--slate-300: #cbd5e1       /* Primary text */
--slate-500: #64748b       /* Secondary text */
--slate-600: #475569       /* Timestamps, hints */
--white/10: rgba()         /* Borders, dividers */
```

**Typography:**
- Monospace for everything: system font stack with fallbacks
- Text sizes: text-xs for meta, text-sm for content
- Tracking: tracking-wider for system labels

**Key UI Elements:**
- Borders: `border-white/10` (subtle, not harsh)
- Glows: `shadow-[0_0_10px_rgba(34,197,94,0.4)]` for success states
- Animations: `animate-pulse` for live indicators
- Hover: `hover:bg-white/5` for interactive elements

---

## Voyager Character: The Astronaut

Voyager has a visual identity - an astronaut character that appears in different states. These illustrations are rendered through an SVG terminal-dither filter to match the UI aesthetic.

**Image Generation Prompts (for Banana/SDXL/etc.):**

### Success / Green Tick State
*Used for: Draft approved, action completed, task done*
```
A hand-drawn black and white pencil sketch of an adult astronaut floating in zero gravity. The astronaut is holding a large, physical checkmark symbol (✓) tucked under one arm like a clipboard. The astronaut gives a relaxed thumbs-up with the other hand. Adult body proportions, realistic spacesuit details but simplified shading. White background, high contrast, clean lines, playful but classy.
```

### Tracer / Searching State
*Used for: Graph traversal, thinking, processing, retrieving*
```
A hand-drawn black and white pencil sketch of an adult astronaut examining a floating star map or a holographic data node with a magnifying glass. Intense focus, adult proportions. White background, clean lines.
```

### Nap Time / Idle State
*Used for: /wrap, end of session, idle, waiting*
```
A hand-drawn black and white pencil sketch of an adult astronaut floating peacefully in a sleeping posture, arms drifting loosely. The astronaut is tethered to a floating anchor. Minimalist style, adult proportions, realistic spacesuit. White background, subtle shading, serene atmosphere.
```

**Style Consistency:**
- Hand-drawn black and white pencil sketch
- Adult astronaut in zero gravity
- White background, high contrast, clean lines
- Realistic spacesuit, simplified shading
- Playful but classy tone

**Terminal Filter (applied in code):**
```tsx
<svg className="absolute w-0 h-0">
  <defs>
    <filter id="terminal-dither">
      <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" />
      <feTurbulence type="fractalNoise" baseFrequency="0.80" numOctaves="3" stitchTiles="stitch" result="noise" />
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.2 0" in="noise" result="coloredNoise" />
      <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite" />
      <feBlend mode="multiply" in="composite" in2="SourceGraphic" />
    </filter>
  </defs>
</svg>

<img
  src={astronautImage}
  style={{ filter: 'url(#terminal-dither) contrast(1.2)' }}
  className="grayscale opacity-90 mix-blend-screen"
/>
```

**Future States to Design:**
- Error / Problem (astronaut looking confused at broken equipment)
- Listening / Waiting (astronaut with hand cupped to helmet)
- Celebrating (astronaut with confetti or trophy)
- Collaborating (two astronauts high-fiving)

## Workflow

1. **Receive design request** with parameters:
   - Component type (button, card, modal, navigation, etc.)
   - Context (where it's used, what it does)
   - Specific requirements (accessibility, interactions)

2. **Call Gemini Flash** with structured design prompt:
   - Best practices for the component type
   - Voyager aesthetic guidelines
   - Technical constraints (Tailwind CSS, React, accessibility)

3. **Receive Gemini output:**
   - Component code (React + Tailwind)
   - Design rationale
   - Illustration suggestions (ASCII/SVG)

4. **Reason about output:**
   - Does it match existing codebase patterns?
   - Is it consistent with other components?
   - Are there accessibility issues?
   - Does the code follow our conventions?

5. **Integrate into codebase:**
   - Write component file
   - Update any indexes/exports
   - Add to Storybook if applicable

## Usage

```
/design [mode] [subject] "[context]"
```

### Modes

**Component Mode (default):**
```
/design button "primary action button for approving drafts"
/design card "knowledge node preview in search results"
/design modal "confirmation dialog for sending messages"
/design interface "onboarding flow for community founder"
```

**Illustration Mode:**
```
/design illustration astronaut "error state - confused at broken equipment"
/design illustration astronaut "celebrating with confetti"
/design illustration icon "graph node with connections"
/design illustration badge "community expert badge"
```

**Thematic Elements:**
```
/design element "loading spinner with terminal aesthetic"
/design element "notification badge with glow effect"
/design element "progress bar for graph traversal"
```

### Output by Mode

| Mode | Output |
|------|--------|
| component | React + Tailwind code, ready to integrate |
| illustration | Image generation prompt (for Banana/SDXL/Midjourney) |
| element | Small UI element code (animations, badges, indicators) |

### Themes

Same system, different visual metaphors for different personas.

```
/design --theme=founder button "approve investment memo"
/design --theme=product interface "roadmap planning view"
```

| Theme | Metaphor | Accent | Avatar | System Name |
|-------|----------|--------|--------|-------------|
| `developer` (default) | Terminal/CLI | Indigo | Astronaut | VOYAGER_SHELL |
| `founder` | Captain's Bridge | Brass/Gold | Navigator | VOYAGER_BRIDGE |
| `product` | Design Studio | Blue | Architect | VOYAGER_STUDIO |
| `creator` | Writer's Desk | Purple | Artist | VOYAGER_CANVAS |
| `ops` | Control Room | Green | Engineer | VOYAGER_CONTROL |

**What stays constant:**
- Underlying interaction patterns (tracer route, green tick, etc.)
- Core layout structure
- Knowledge graph, context awareness, notification inversion

**What changes:**
- Color palette and accent
- Metaphor language ($CTX vs @Context vs [Context])
- Avatar character style
- File/draft naming conventions

## Gemini Prompt Templates

### For Components
```
You are a UI designer specializing in retro console aesthetics with modern usability.

Design a {component_type} component for Voyager, a collaboration platform.

AESTHETIC:
- Console/terminal feel: monospace hints, command-line energy
- Retro computing: phosphor glow effects, vintage warmth
- Nautical touches: brass accents, maritime instrument inspiration
- Beautiful details: subtle gradients, box-drawing characters, ASCII art flourishes

TECHNICAL REQUIREMENTS:
- React functional component with TypeScript
- Tailwind CSS for styling
- Accessible (WCAG AA)
- Responsive
- Named exports only

CONTEXT:
{context}

OUTPUT FORMAT:
1. Component code (React + Tailwind + TypeScript)
2. Design rationale (why these choices)
3. Illustration suggestion (ASCII art or SVG concept if applicable)
4. Variants (if the component needs states/variants)
```

### For Illustrations
```
You are an art director creating illustrations for Voyager, a terminal-themed collaboration app.

Generate an image generation prompt for: {subject} - {context}

STYLE REQUIREMENTS:
- Hand-drawn black and white pencil sketch
- White background, high contrast, clean lines
- Adult proportions (if human/astronaut)
- Playful but classy tone
- Suitable for terminal-dither SVG filter post-processing

OUTPUT FORMAT:
A single, detailed image generation prompt (50-100 words) that can be used with SDXL, Midjourney, or similar.

REFERENCE PROMPTS (match this style):
- "A hand-drawn black and white pencil sketch of an adult astronaut floating in zero gravity, holding a large checkmark symbol tucked under one arm, giving a thumbs-up. Adult body proportions, realistic spacesuit details but simplified shading. White background, high contrast, clean lines, playful but classy."
```

## Implementation

When this skill is invoked:

1. Parse the component type and context from arguments
2. Execute: `npx ts-node .claude/scripts/gemini-design.ts <component> "<context>"`
3. Read Gemini's response (component code, rationale, illustrations, variants)
4. Reason about the output:
   - Does it match existing codebase patterns in `/components`?
   - Are the Tailwind classes consistent with our config?
   - Is the TypeScript correct and well-typed?
   - Are there accessibility issues to address?
5. Propose integration:
   - Suggest file path (e.g., `components/ui/Button.tsx`)
   - Show the component with any modifications needed
   - Offer to write the file after user approval

**Script location:** `.claude/scripts/gemini-design.ts` (project-level)

**Required env:** `GEMINI_API_KEY`

## Example Session

```
User: /design button "green tick approval button for drafts"

Claude: Running Gemini design agent...

[Executes script, receives output]

Gemini designed a button with:
- Retro terminal styling with [ ✓ Approve ] bracket hints
- Phosphor green glow on hover
- Accessible focus states

I'd suggest these modifications:
- Add `aria-label` for screen readers
- Use our existing `cn()` utility for class merging

Proposed file: components/ui/ApproveButton.tsx

[Shows component code]

Write this file? [Yes] [Edit first]
```

$ARGUMENTS
