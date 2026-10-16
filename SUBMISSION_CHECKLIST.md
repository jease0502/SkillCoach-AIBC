# Submission Checklist

Google Cloud AI Builder Cup 2026 (Hack2skill, JAPAC). **Deadline: 2026-10-18** (confirm the exact cutoff time and time zone on the Hack2skill portal and submit at least a few hours early).

## Eligibility

- [ ] Team of 2 to 4 members, all registered on the Hack2skill portal
- [ ] Every member is 21 or older
- [ ] Every member is a working professional (no students)
- [ ] Project is a fresh build created during the hackathon timeline (commit history starts within the timeline)
- [ ] Theme selected: Future of Work & Enterprise Productivity

## Mandatory technology

- [ ] Uses Google AI models (Gemini via Vertex AI `google-genai` SDK: `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, `gemini-embedding-001`; seven Gemini agent roles) as a core part of the solution
- [x] Deployed on Cloud Run in `asia-east1`, with `GOOGLE_CLOUD_LOCATION=global` and `GEMINI_EMBED_LOCATION=asia-east1` (see [docs/deployment.md](docs/deployment.md)). Web: https://skillcoach-web-817759648389.asia-east1.run.app · API: https://skillcoach-api-817759648389.asia-east1.run.app
- [ ] Repo shows where Gemini is called (README "How Gemini is used" section points to the code)

## Mandatory deliverables

- [ ] **Deployed link** (https://skillcoach-web-817759648389.asia-east1.run.app) pasted into the form (already in README)
- [ ] **Demo video** under 3 minutes, uploaded to YouTube / Vimeo / public Google Drive, link in form and README
- [ ] **Public GitHub repository** link in form
- [ ] **PDF deck** covering vision, problem, community benefit, feasibility, scalability (outline: [docs/HACKATHON.md](docs/HACKATHON.md#4-pdf-deck-outline-12-slides))
- [ ] All materials in **English** (UI, README, docs, video voiceover/captions, deck)

## Pre-submit sanity checks

### Deployed app
- [ ] URL opens in an **incognito window** on a different device / network without login walls (or demo credentials are given in the form and README)
- [ ] Demo scenarios load and a full session (practice turns + report) completes end to end
- [ ] Compliance flag, coach hint and citations all trigger with the lines in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- [ ] Scenario B line 2 triggers the Compliance Guard card ("Edit message" / "Send anyway") on the production URL
- [ ] Scenario B report shows the compliance gate failed (overall score capped at 59); report quotes are marked verified
- [ ] Persona approval works (`POST /api/personas/{id}/approve`), and a draft persona cannot back a scenario
- [ ] Cloud Run min instances set to 1 (or service pre-warmed) through the judging period to avoid cold starts
- [ ] Billing account and Vertex AI quota will remain active through judging; budget alert configured
- [ ] Model check from [docs/deployment.md](docs/deployment.md) section 2 passes on deploy day (3.x models on `global`, embeddings in `asia-east1`)
- [ ] Works on mobile width and in Chrome, Edge, Safari (at least text mode)

### Video
- [ ] Duration under 3:00 (check the final exported file, not the timeline)
- [ ] Visibility is Public or Unlisted (Drive: "Anyone with the link can view")
- [ ] Opens in an incognito window
- [ ] Shows the live Cloud Run URL and Gemini in action; captions enabled

### Repository
- [ ] Repository is **public**
- [ ] **No secrets committed**: no API keys, service account JSON, `.env` (only `.env.example`). Scan history, e.g. `git log -p | grep -iE "api[_-]?key|private_key|secret"` or gitleaks
- [ ] `.gitignore` covers `.env`, credentials, `node_modules`, `.venv`, build output
- [ ] README has live URL, video URL, quick start, deploy steps, architecture link, license (Apache-2.0)
- [ ] `LICENSE` file present (Apache-2.0, at the repository root)
- [ ] Only features that actually work are described as working; others marked "planned"
- [ ] No non-English text in code comments, UI strings, or docs
- [ ] No claim that data never leaves Taiwan; wording is "data at rest and embeddings in the chosen APAC region, Gemini generation via the Vertex AI global endpoint"

### Deck
- [ ] Exported as PDF; opens correctly; file size reasonable (< 20 MB)
- [ ] Every statistic has a source, or is removed
- [ ] Contains live URL (in [docs/DECK.md](docs/DECK.md)), video URL, GitHub URL, team names

### Form
- [ ] All links tested from the submitted form itself after submission
- [ ] Team member names and emails correct
- [ ] Confirmation email / portal status received
