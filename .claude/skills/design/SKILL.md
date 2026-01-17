---
name: design
description: Design UI components with Gemini using Voyager design system. Generates React/Tailwind code.
---

# /design - UI Component Design

Design Voyager UI components using Gemini with the full design system context.

## Script Location

`.claude/scripts/gemini-design.ts`

## Usage

Parse the user's request and invoke the script:

```bash
npx tsx .claude/scripts/gemini-design.ts <component_type> "context"
```

## Component Types

- **button** - Interactive buttons (primary, secondary, danger)
- **card** - Content containers, previews
- **modal** - Dialogs, confirmations
- **input** - Text inputs, search fields
- **select** - Dropdowns, pickers
- **element** - Small UI pieces (badges, spinners, indicators)
- **interface** - Larger compositions, panels

## Examples

**Button for approvals:**
```bash
npx tsx .claude/scripts/gemini-design.ts button "primary action for approving AI-generated drafts"
```

**Knowledge preview card:**
```bash
npx tsx .claude/scripts/gemini-design.ts card "knowledge node preview showing title, summary, and connections"
```

**Confirmation dialog:**
```bash
npx tsx .claude/scripts/gemini-design.ts modal "delete voyage confirmation with warning"
```

**Loading spinner:**
```bash
npx tsx .claude/scripts/gemini-design.ts element "loading spinner for deep retrieval"
```

**Settings panel:**
```bash
npx tsx .claude/scripts/gemini-design.ts interface "voyage settings with members, invite link, and permissions"
```

## Design System Context

The script uses `UI_DESIGN_SYSTEM_PROMPT` which includes:

**Colors:**
- Obsidian: #050505 (backgrounds)
- Surface: #0A0A0A (cards)
- Indigo-400: #818cf8 (system accent)
- Green-500: #22c55e (success)
- Slate-300: #cbd5e1 (text)

**Aesthetic:**
- Console/terminal feel with monospace hints
- Retro computing: phosphor glow, CRT warmth
- Box-drawing characters: ─│┌┐└┘├┤┬┴┼
- Subtle gradients and borders (border-white/10)

**Technical:**
- React functional components with TypeScript
- Tailwind CSS styling
- Accessible (WCAG AA)
- Named exports, arrow functions

## Output Format

The script outputs:
1. **COMPONENT CODE** - Full React/TypeScript component
2. **DESIGN RATIONALE** - Why these design choices
3. **ILLUSTRATION SUGGESTION** - ASCII art or visual concepts
4. **VARIANTS** - Size/state/theme variations

## After Design

1. Run the script with component type and context
2. Review the generated code
3. Ask user if they want to:
   - Save to a specific file
   - Modify the design
   - Generate visual illustration with /imagine
