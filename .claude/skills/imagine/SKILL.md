---
name: imagine
description: Generate images with Gemini 2.0 Flash. Supports Voyager aesthetic, astronaut states, transparent backgrounds.
---

# /imagine - Image Generation

Generate images using Gemini 2.0 Flash with Voyager aesthetic styling.

## Script Location

`.claude/scripts/gemini-imagine.ts`

## Usage

Parse the user's request and invoke the script with appropriate flags:

```bash
npx tsx .claude/scripts/gemini-imagine.ts [flags] "prompt"
```

## Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--voyager` | `-v` | Apply Voyager color palette and aesthetic |
| `--terminal` | `-t` | Terminal/console aesthetic (implies --voyager) |
| `--astronaut <state>` | `-a` | Generate Voyager astronaut character |
| `--transparent` | | Remove background with rembg |
| `--output <file>` | `-o` | Custom output filename |

## Astronaut States

| State | Description |
|-------|-------------|
| `success` | Planting flag with checkmark, triumphant |
| `searching` | Holding lantern, reaching toward constellation |
| `idle` | Floating peacefully, arms behind head |
| `error` | Looking at broken equipment, puzzled |
| `listening` | Hand cupped to helmet, attentive |
| `celebrating` | Arms raised, confetti, pure joy |

## Examples

**Basic generation:**
```bash
npx tsx .claude/scripts/gemini-imagine.ts "a serene mountain lake at dawn"
```

**Voyager aesthetic:**
```bash
npx tsx .claude/scripts/gemini-imagine.ts --voyager "futuristic control room with holographic displays"
```

**Astronaut illustration:**
```bash
npx tsx .claude/scripts/gemini-imagine.ts --astronaut success
npx tsx .claude/scripts/gemini-imagine.ts --astronaut searching
```

**Transparent background:**
```bash
npx tsx .claude/scripts/gemini-imagine.ts --transparent "friendly robot mascot"
```

**Terminal-themed:**
```bash
npx tsx .claude/scripts/gemini-imagine.ts --terminal "loading spinner concept art"
```

## Output

Images saved to `generated-images/` with auto-generated timestamps.
Use `--output filename.png` for custom names.

## Interpretation Guide

When user says... | Use flag...
---|---
"voyager style", "voyager colors", "voyager aesthetic" | `--voyager`
"astronaut" + state word | `--astronaut <state>`
"terminal", "console", "CLI" | `--terminal`
"floating", "no background", "transparent" | `--transparent`
"save as X", "call it X" | `--output X.png`

## After Generation

1. Run the script with appropriate flags
2. Read the generated image to display it to the user
3. Report the output path
