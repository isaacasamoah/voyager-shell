#!/usr/bin/env python3
"""
AI-powered background removal for astronaut images.
Keeps the astronaut (including white fill), removes only the background.
"""

import os
from pathlib import Path
from rembg import remove
from PIL import Image

INPUT_DIR = Path("generated-images")
OUTPUT_DIR = Path("public/images/astronaut")

# Map source files to output names
MAPPINGS = [
    ("astronaut-success-v4-flag.png", "success.png"),
    ("astronaut-searching.png", "searching.png"),
    ("astronaut-idle-v2.png", "idle.png"),
    ("astronaut-error.png", "error.png"),
    ("astronaut-listening-v2.png", "listening.png"),
    ("astronaut-celebrating.png", "celebrating.png"),
]

def process_image(input_path: Path, output_path: Path):
    print(f"Processing {input_path.name}...")

    # Load image
    input_image = Image.open(input_path)

    # Remove background using AI
    output_image = remove(input_image)

    # Save with transparency
    output_image.save(output_path, "PNG")
    print(f"  ✓ Saved: {output_path.name}")

def main():
    print("\n🎨 AI Background Removal (rembg)\n")
    print("─" * 50)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for input_name, output_name in MAPPINGS:
        input_path = INPUT_DIR / input_name
        output_path = OUTPUT_DIR / output_name

        if input_path.exists():
            process_image(input_path, output_path)
        else:
            print(f"  ⚠ {input_name} not found")

    print("─" * 50)
    print("\n✅ Done! Astronauts extracted with AI precision.\n")

if __name__ == "__main__":
    main()
