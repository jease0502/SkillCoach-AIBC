"""Encode the Veo clips and portraits for the web: frontend/public/avatars/video/.

    python tools/avatars/web_clips.py

<id>-{listen,talk,upset}.mp4 -> 960 px H.264, no audio, faststart (about 0.5 MB each)
<id>.png                     -> <id>.jpg poster (first frame of every clip)
Needs ffmpeg on PATH.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image

SRC = Path("media/avatars")
OUT = Path("frontend/public/avatars/video")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for png in sorted(SRC.glob("persona-*.png")):
        im = Image.open(png).convert("RGB")
        im.thumbnail((960, 960), Image.LANCZOS)
        im.save(OUT / f"{png.stem}.jpg", "JPEG", quality=84, optimize=True)
    for mp4 in sorted(SRC.glob("persona-*-*.mp4")):
        dst = OUT / mp4.name
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(mp4), "-an", "-vf", "scale=960:-2",
             "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
             str(dst)],
            check=True,
        )
        print(dst, dst.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
