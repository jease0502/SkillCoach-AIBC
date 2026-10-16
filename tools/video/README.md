# Demo video pipeline

Produces `media/demo.mp4` (1080p, H.264 + AAC, burned-in English captions), `media/subtitles.srt` and `media/voiceover.txt`. Intermediates go to `media/build/` (git-ignored).

The video is recorded from the **live site**. Nothing is staged or mocked. Long Gemini waits are cut, and each cut is labeled on screen with its measured length ("Gemini persona generation: 9 s, shortened").

## Steps

```bash
cd tools/video
npm install                 # Playwright (uses its bundled Chromium)

node synth.mjs              # 1. Voiceover with Google Cloud Text-to-Speech (one WAV per cue)
node cards.mjs              # 2. Title, architecture and end cards
node record.mjs             # 3. Drive the live site and record a timestamped screencast
node compose.mjs            # 4. Cut, align voice to the recording, captions, encode
```

- `synth.mjs` calls `texttospeech.googleapis.com` with `gcloud auth print-access-token` and the project from `gcloud config get-value project`. You can override them with `GOOGLE_ACCESS_TOKEN` and `GOOGLE_CLOUD_PROJECT`. The voice is `en-US-Chirp3-HD-Charon` (set in `cues.json`, or use `--voice`/`--rate`). `--only c08_guard` re-voices a single cue.
- `node synth.mjs --draft` uses the offline Windows voice. It is only for timing dry runs; never ship it.
- `record.mjs` paces itself on the voiceover durations, so run it **after** `synth.mjs`. Add `--headed` to watch. It approves a generated persona as part of the story and deletes it again at the end. It leaves one real practice session on the live site.
- `compose.mjs` prints the final length and warns if any cue overlaps another or if the video is longer than 2:59.5.

## How to rebuild

| What changed | Run |
| --- | --- |
| Caption style, card timing, mix | `node compose.mjs` (reuses the recording and voice) |
| Card design or URLs | `node cards.mjs && node compose.mjs` |
| The app, or a step in the storyboard | `node record.mjs && node compose.mjs` |
| Voiceover text in `cues.json` | `node synth.mjs --only <cue ids>`, then `node record.mjs && node compose.mjs` (the recording is paced on cue lengths) |

Before recording:

- Pre-warm both Cloud Run services (open the site once) so the first turn has no cold start.
- Start from a clean dashboard. Each recording leaves one real practice session on the live site; delete the sessions of discarded takes.
- If the run stops with "Compliance Guard did not appear", the precheck took longer than 2.5 s. Run it again.
- Check the result: `compose.mjs` must print no overlap warnings and a length under 2:59.5. Look at the frames around the Compliance Guard, the pipeline trace and the dashboard.

The published take (2:46) used `en-US-Chirp3-HD-Charon` at rate 1.0 and practice session `5867b49a17`.

## Files

| File | Role |
| --- | --- |
| `cues.json` | Voiceover text, one cue per beat (single source of truth for voiceover and captions) |
| `record.mjs` | The storyboard as Playwright steps: landing, knowledge, persona builder, scenario B, report, dashboard |
| `cards.mjs` | HTML cards rendered to PNG |
| `compose.mjs` | ffmpeg: screencast frames to video with cuts removed, cards, voice mix, ASS captions, final encode |
| `paths.mjs` | Shared paths, site URLs (`SKILLCOACH_WEB`, `SKILLCOACH_API`) |
