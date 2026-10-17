"""Photorealistic portraits of the seed customers with Gemini image generation (Vertex AI).

    python tools/avatars/gen_portraits.py [persona-id ...]

Writes media/avatars/<persona-id>.png (16:9, head and shoulders, looking into the camera).
These are fictional people; the prompts say so and forbid likenesses of real people.
Needs Vertex AI credentials (ADC) and GOOGLE_CLOUD_PROJECT.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from google import genai
from google.genai import types

MODEL = os.environ.get("PORTRAIT_MODEL", "gemini-3-pro-image")
OUT = Path("media/avatars")

COMMON = (
    "Photorealistic portrait photograph, 16:9, eye-level camera at about one metre. A fictional person (not a real or "
    "famous person) sits facing the camera, head and shoulders centred in the frame with some space above the "
    "head, looking straight into the lens, mouth closed, relaxed neutral expression. Natural soft window light, "
    "realistic skin texture, shallow depth of field, slightly out-of-focus background. A clean full-bleed photo: "
    "no user-interface elements, no buttons, no name labels, no timestamps, no captions, no borders or window "
    "frames, no text of any kind, no logos, no watermark, no other people."
)

PERSONAS = {
    "persona-mr-tan": (
        "Mr. Tan, a 63-year-old recently retired Singaporean Chinese schoolteacher, short grey hair, rimless "
        "glasses, light blue collared shirt with a grey cardigan, cautious and polite. Background: a calm, modern "
        "bank branch consultation room with a wooden desk."
    ),
    "persona-dana-kim": (
        "Dana Kim, a 46-year-old Korean-American CFO of a logistics company, shoulder-length dark hair, navy "
        "blazer over a white blouse, sharp and busy. Background: a bright modern office with glass meeting rooms."
    ),
    "persona-alex-morgan": (
        "Alex Morgan, a 29-year-old man, short brown hair, light stubble, casual dark green hoodie, visibly "
        "annoyed but holding it together. Background: a tidy small apartment living room."
    ),
}


def main(ids: list[str]) -> None:
    client = genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"],
                          location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
    OUT.mkdir(parents=True, exist_ok=True)
    for pid in ids or list(PERSONAS):
        resp = client.models.generate_content(
            model=MODEL,
            contents=f"{COMMON} {PERSONAS[pid]}",
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="16:9"),
            ),
        )
        parts = [p for c in resp.candidates or [] for p in (c.content.parts or []) if p.inline_data]
        if not parts:
            raise SystemExit(f"{pid}: no image returned")
        path = OUT / f"{pid}.png"
        path.write_bytes(parts[0].inline_data.data)
        print("wrote", path, len(parts[0].inline_data.data) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1:])
