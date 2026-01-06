/**
 * Voyager Aesthetic Guidelines
 *
 * Style definitions for Voyager-themed image and UI generation.
 */

/**
 * Core Voyager visual language
 */
export const VOYAGER_AESTHETIC = {
  /**
   * Color palette
   */
  colors: {
    obsidian: "#050505",      // Background - not pure black
    surface: "#0A0A0A",       // Cards, elevated surfaces
    indigo: "#818cf8",        // System/Voyager accent
    green: "#22c55e",         // Success, approval, found
    amber: "#ffb000",         // Warnings, highlights, warmth
    slate: {
      300: "#cbd5e1",         // Primary text
      500: "#64748b",         // Secondary text
      600: "#475569",         // Timestamps, hints
    },
  },

  /**
   * The Astronaut character states
   * Assets located at: /public/images/astronaut/{state}.png
   */
  astronaut: {
    style: "Hand-drawn WHITE pencil or chalk sketch on pure BLACK background. Adult astronaut in zero gravity, realistic spacesuit with simplified shading. White lines only, no gray, high contrast, clean confident lines. Playful but professional. The background must be solid black (#000000).",
    assets: {
      success: "/images/astronaut/success.png",
      searching: "/images/astronaut/searching.png",
      idle: "/images/astronaut/idle.png",
      error: "/images/astronaut/error.png",
      listening: "/images/astronaut/listening.png",
      celebrating: "/images/astronaut/celebrating.png",
    },
    states: {
      success: "planting a FLAG into the ground like the iconic moon landing photograph. The flag has a large CHECKMARK symbol on it. Gripping the flagpole with both hands, triumphantly planting it. Triumphant, historic energy - a moment of achievement.",
      searching: "holding an old-fashioned LANTERN in one hand that casts light outward. Reaching with the other hand toward a CONSTELLATION of stars CONNECTED BY THIN LINES - like a network graph. Pose suggests curiosity and discovery - leaning forward, actively exploring.",
      idle: "floating peacefully in the void, completely alone and at rest. Arms folded behind head like a pillow, legs loosely crossed at the ankles, body gently reclined. Pure weightless relaxation. Meditative, peaceful, unhurried - the visual equivalent of a deep exhale.",
      error: "looking at a piece of BROKEN EQUIPMENT with visible confusion. One hand raised to the side of helmet in a 'what happened?' gesture. Broken device with disconnected wires or floating components nearby. Body language is PUZZLED but calm - not panicked, more like mild frustration. Head tilted, shoulders slightly raised in a shrug. The mood is 'well, that didn't work' - relatable, slightly comedic.",
      listening: "in an ATTENTIVE LISTENING pose. One hand CUPPED to the side of helmet, as if trying to hear a distant signal. Head TILTED slightly to one side - the universal gesture of careful listening. Body still and alert. Small signal waves near the cupped hand. Patient, receptive - 'I'm here, I'm listening.' Calm attentiveness.",
      celebrating: "in a pose of PURE JOY and celebration. Both ARMS RAISED HIGH above head in triumph, fists pumped or hands open wide. Body ARCHED BACK with elation. Small stars or confetti particles floating around. Dynamic and energetic - breakthrough euphoria, championship energy. Unbridled joy.",
    }
  },

  /**
   * Terminal/console aesthetic
   */
  terminal: {
    metaphors: [
      "Context as environment variables: $CTX",
      "Drafts as files: DRAFT.md",
      "Input as command prompt: ➜ ~/project",
      "Loading as process traversal",
    ],
    elements: [
      "Monospace typography",
      "Phosphor glow effects",
      "Box-drawing characters: ─│┌┐└┘",
      "Subtle scanline texture",
      "CRT warmth and curvature hints",
    ]
  }
};

/**
 * Enhance an image prompt with Voyager aesthetic
 */
export function enhanceWithVoyagerStyle(prompt: string, type: "general" | "astronaut" | "terminal" = "general"): string {
  const baseEnhancements = [
    "Color palette: deep obsidian blacks (#050505), indigo accents (#818cf8), terminal green (#22c55e), warm amber highlights (#ffb000)",
    "Aesthetic: retro computing meets nautical exploration",
    "Mood: professional yet warm, technical yet human",
  ];

  if (type === "astronaut") {
    return `${VOYAGER_AESTHETIC.astronaut.style}. ${prompt}`;
  }

  if (type === "terminal") {
    return `Terminal/console aesthetic with ${VOYAGER_AESTHETIC.terminal.elements.join(", ")}. ${prompt}. ${baseEnhancements.join(". ")}`;
  }

  return `${prompt}. ${baseEnhancements.join(". ")}`;
}

/**
 * Get astronaut prompt for a specific state
 */
export function getAstronautPrompt(state: keyof typeof VOYAGER_AESTHETIC.astronaut.states): string {
  const stateDescription = VOYAGER_AESTHETIC.astronaut.states[state];
  return `${VOYAGER_AESTHETIC.astronaut.style}, ${stateDescription}`;
}

/**
 * UI Component design system prompt for Gemini
 */
export const UI_DESIGN_SYSTEM_PROMPT = `You are a UI designer specializing in retro console aesthetics with modern usability.

VOYAGER DESIGN SYSTEM:

Aesthetic Principles:
- Console/terminal feel: monospace hints, command-line energy, typewriter rhythm
- Retro computing: phosphor glow effects, CRT warmth, vintage computing nostalgia
- Nautical touches: brass accents, maritime instrument inspiration
- Beautiful details: subtle gradients, box-drawing characters (─│┌┐└┘├┤┬┴┼)

Color Palette:
- Obsidian: #050505 (backgrounds)
- Surface: #0A0A0A (cards, elevated)
- Indigo-400: #818cf8 (system accent)
- Green-500: #22c55e (success, approval)
- Slate-300: #cbd5e1 (primary text)
- Slate-500: #64748b (secondary text)
- White/10: rgba(255,255,255,0.1) (borders)

Typography:
- Monospace for everything: system font stack
- text-xs for meta, text-sm for content
- tracking-wider for system labels

UI Patterns:
- Borders: border-white/10 (subtle)
- Glows: shadow-[0_0_10px_rgba(34,197,94,0.4)] for success
- Hover: hover:bg-white/5
- Animations: animate-pulse for live indicators

Technical Requirements:
- React functional component with TypeScript
- Tailwind CSS for styling
- Accessible (WCAG AA)
- Named exports only
- Arrow function components
- Props interface above component`;
