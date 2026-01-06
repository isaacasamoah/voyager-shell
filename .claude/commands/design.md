# /design - UI Component Design Agent

Generate Voyager UI components using Gemini Flash. Outputs React + Tailwind code, not images.

> **For image generation**, use `/imagine` instead.
> **For astronaut illustrations**, use `/imagine --astronaut <state>`

## Usage

```
/design <component-type> "<context>"
```

### Examples

```bash
# Components
/design button "primary action for approving drafts"
/design card "knowledge node preview in search results"
/design modal "confirmation dialog for sending messages"
/design input "search box with command palette trigger"

# Small elements
/design element "loading spinner with terminal aesthetic"
/design element "status badge with glow effect"
/design element "progress bar for graph traversal"

# Full interfaces
/design interface "onboarding flow for new user"
/design interface "settings panel with theme toggle"
```

## Output

For each component, Gemini returns:
1. **Component Code** - React + Tailwind + TypeScript
2. **Design Rationale** - Why these aesthetic choices
3. **Illustration Suggestion** - ASCII art or SVG concept
4. **Variants** - States and variations if applicable

## Design System

### Color Palette
```
--obsidian: #050505        /* Background */
--surface: #0A0A0A         /* Cards, elevated */
--indigo-400: #818cf8      /* System accent */
--green-500: #22c55e       /* Success, approval */
--slate-300: #cbd5e1       /* Primary text */
--slate-500: #64748b       /* Secondary text */
--white/10: rgba()         /* Borders */
```

### Core Patterns
- Borders: `border-white/10`
- Glows: `shadow-[0_0_10px_rgba(34,197,94,0.4)]`
- Hover: `hover:bg-white/5`
- Animations: `animate-pulse` for live states

### Terminal Metaphors
- Context as env vars: `$CTX: PROJECT_X`
- Drafts as files: `DRAFT.md`
- Input as prompt: `➜ ~/project`
- Loading as process: `TRAVERSING...`

## Technical Requirements

All generated components follow:
- React functional components with TypeScript
- Tailwind CSS (using project config)
- WCAG AA accessibility
- Named exports only
- Arrow function syntax
- Props interface above component

## Workflow

1. Parse component type and context
2. Call Gemini with design system prompt
3. Receive structured output
4. Reason about codebase fit:
   - Match existing patterns in `/components`
   - Verify Tailwind classes
   - Check TypeScript correctness
   - Address accessibility
5. Propose integration with file path
6. Write file after user approval

## Implementation

Execute:
```bash
npx tsx .claude/scripts/gemini-design.ts <component> "<context>"
```

**Script:** `.claude/scripts/gemini-design.ts`
**Env:** `GOOGLE_GEMINI_API_KEY`

---

## Related Skills

| Skill | Use Case |
|-------|----------|
| `/design` | Generate UI component code |
| `/imagine` | Generate any image |
| `/imagine --voyager` | Image with Voyager aesthetic |
| `/imagine --astronaut` | Voyager astronaut illustrations |

$ARGUMENTS
