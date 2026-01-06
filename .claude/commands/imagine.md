# /imagine - Image Generation with Gemini

Generate images using Gemini 2.0 Flash with optional Voyager aesthetic styling.

## Usage

```
/imagine "a sunset over mountains"
/imagine --voyager "futuristic control room with holographic displays"
/imagine --astronaut success
/imagine --terminal "loading animation concept art"
```

## Options

| Flag | Short | Description |
|------|-------|-------------|
| `--voyager` | `-v` | Apply Voyager aesthetic (color palette, mood) |
| `--terminal` | `-t` | Terminal/console aesthetic (implies --voyager) |
| `--astronaut` | `-a` | Generate Voyager astronaut character in a state |
| `--transparent` | | Remove background with AI (rembg) - floating on transparent |
| `--output` | `-o` | Custom output filename |

## Astronaut States

The Voyager astronaut character can be generated in these states:

| State | Description |
|-------|-------------|
| `success` | Holding checkmark, giving thumbs-up |
| `searching` | Examining star map with magnifying glass |
| `idle` | Floating peacefully, tethered to anchor |
| `error` | Confused at broken equipment |
| `listening` | Hand cupped to helmet |
| `celebrating` | Arms raised with confetti |

## Examples

### Basic image generation
```
/imagine "a cozy coffee shop on a rainy afternoon, warm lighting"
```

### With Voyager aesthetic
```
/imagine --voyager "dashboard showing real-time collaboration metrics"
```

### Astronaut illustration
```
/imagine --astronaut success
/imagine --astronaut searching
```

### Terminal-themed concept art
```
/imagine --terminal "graph visualization of knowledge connections"
```

### Transparent background (floating)
```
/imagine --transparent "a friendly robot mascot waving"
/imagine --transparent --voyager "futuristic badge icon"
```

## Output

Images are saved to `generated-images/` directory with auto-generated timestamps.
Use `--output filename.png` to specify a custom name.

## Implementation

**Script:** `.claude/scripts/gemini-imagine.ts`

When invoked, execute:
```bash
npx tsx .claude/scripts/gemini-imagine.ts $ARGUMENTS
```

Parse the user's input and pass appropriate flags:
- If user says "voyager style" or "voyager aesthetic" → add `--voyager`
- If user mentions "astronaut" with a state → add `--astronaut <state>`
- If user mentions "terminal" or "console" style → add `--terminal`
- The prompt should be quoted and passed as the final argument

After execution, read and display the generated image to the user.

---

*Powered by Gemini 2.0 Flash with Imagen*
