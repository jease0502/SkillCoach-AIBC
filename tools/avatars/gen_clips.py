"""Turn the customer portraits into short looping video clips with Veo (Vertex AI).

    python tools/avatars/gen_clips.py [persona-id[:clip] ...]

For each persona (media/avatars/<id>.png) it makes three 8-second clips:
  listen  - listening quietly: blinks, small nods, mouth closed
  talk    - speaking calmly to the camera
  upset   - listening, visibly unhappy or worried
The first and last frame are both the portrait, so each clip loops seamlessly.
Writes media/avatars/<id>-<clip>.mp4 (no audio; the app speaks with the browser voice).
Needs Vertex AI credentials (ADC) and GOOGLE_CLOUD_PROJECT; Veo runs in us-central1.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

MODEL = os.environ.get("VEO_MODEL", "veo-3.1-fast-generate-001")
SRC = Path("media/avatars")

STYLE = (
    "Static locked-off camera, no zoom, no camera movement, no cuts. The person stays seated in the same place, "
    "head and shoulders in frame, and returns to the starting pose at the end. Natural, subtle, realistic "
    "motion, like a real person on a video call. No text, no captions, no music."
)

CLIPS = {
    "listen": "The person silently listens to someone speaking off-camera and never speaks: lips stay closed and "
              "still for the entire clip, no talking, no mouthing words. Natural blinking, a small nod or two, tiny "
              "head tilts, calm breathing, eyes on the camera.",
    "talk": "The person talks to the camera in a calm conversational way: natural mouth and jaw movement as if "
            "speaking full sentences, small head movements and expressive eyebrows, occasional blinks.",
    "upset": "The person silently listens and is not happy with what they hear, and never speaks: lips stay "
             "pressed together for the entire clip, no talking. A slight frown, a sceptical look, a small shake of "
             "the head, eyes on the camera.",
}


def image_part(path: Path) -> types.Image:
    return types.Image(image_bytes=path.read_bytes(), mime_type="image/png")


def make(client: genai.Client, pid: str, clip: str) -> None:
    portrait = SRC / f"{pid}.png"
    out = SRC / f"{pid}-{clip}.mp4"
    op = client.models.generate_videos(
        model=MODEL,
        prompt=f"{CLIPS[clip]} {STYLE}",
        image=image_part(portrait),
        config=types.GenerateVideosConfig(
            aspect_ratio="16:9",
            duration_seconds=8,
            number_of_videos=1,
            last_frame=image_part(portrait),
            generate_audio=False,
            person_generation="allow_adult",
            negative_prompt=None if clip == "talk" else "talking, speaking, open mouth, lip movement, mouthing words",
        ),
    )
    t0 = time.time()
    while not op.done:
        time.sleep(10)
        op = client.operations.get(op)
    if op.error:
        raise SystemExit(f"{pid}-{clip}: {op.error}")
    videos = op.response.generated_videos if op.response else None
    if not videos:
        raise SystemExit(f"{pid}-{clip}: no video (filtered?) {op.response}")
    out.write_bytes(videos[0].video.video_bytes)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB) in {time.time() - t0:.0f} s")


def main(args: list[str]) -> None:
    client = genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"], location="us-central1")
    jobs = []
    for a in args or [p.stem for p in SRC.glob("persona-*.png")]:
        pid, _, clip = a.partition(":")
        jobs += [(pid, c) for c in ([clip] if clip else CLIPS)]
    for pid, clip in jobs:
        make(client, pid, clip)


if __name__ == "__main__":
    main(sys.argv[1:])
