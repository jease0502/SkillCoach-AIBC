# Submission Checklist

Google Cloud AI Builder Cup 2026 (Hack2skill, JAPAC). **Deadline: 2026-10-18** (confirm the exact cutoff time and time zone on the Hack2skill portal and submit at least a few hours early).

## Eligibility

- [ ] Team of 2 to 4 members, all registered on the Hack2skill portal
- [ ] Every member is 21 or older
- [ ] Every member is a working professional (no students)
- [ ] Project is a fresh build created during the hackathon timeline (commit history starts within the timeline)
- [ ] Theme selected: Future of Work & Enterprise Productivity

## Mandatory technology

- [ ] Uses Google AI models (Gemini via Vertex AI `google-genai` SDK: `gemini-4-argon`, `gemini-3.5-flash-lite`, `gemini-embedding-001`, with `gemini-3.8-flash` / `gemini-3.1-pro-preview` fallbacks; seven Gemini agent roles) as a core part of the solution
- [x] Deployed on Cloud Run in `asia-east1` (project `nestor-dev-tw`), with `GOOGLE_CLOUD_LOCATION=global` and `GEMINI_EMBED_LOCATION=asia-east1`, behind Firebase Hosting (site `skillcoach-aibc`); Firestore named database `skillcoach` (see [docs/deployment.md](docs/deployment.md)). Public: https://skillcoach-aibc.web.app · Web (Cloud Run): https://skillcoach-web-506140624406.asia-east1.run.app · API: https://skillcoach-api-506140624406.asia-east1.run.app
- [ ] Repo shows where Gemini is called (README "How Gemini is used" section points to the code)

## Mandatory deliverables

- [ ] **Deployed link** (https://skillcoach-aibc.web.app) pasted into the form (already in README). The deployed prototype must stay functional during the whole evaluation period
- [ ] **Brief description** pasted into the form from [docs/SUBMISSION_BRIEF.md](docs/SUBMISSION_BRIEF.md) (how we use Firebase, Firestore, Cloud Run and Gemini)
- [ ] **Demo video** 3 to 4 minutes (rules: 3-4 minutes), uploaded to YouTube / Vimeo / public Google Drive, link in form and README (re-recording in progress; link still `TODO`)
- [ ] **Public GitHub repository** (https://github.com/jease0502/SkillCoach-AIBC) link in form
- [ ] **Pitch deck on the official template** ("Participants must submit the pitch deck using the provided template"): [media/SkillCoach_Submission.pdf](media/SkillCoach_Submission.pdf) / [.pptx](media/SkillCoach_Submission.pptx), built by `tools/deck/build_submission_deck.py` from `Submission Template _ AI Builder Cup.pptx`. Covers vision, problem, community benefit, feasibility, scalability (content: [docs/DECK.md](docs/DECK.md)). The older `media/SkillCoach_Deck.pptx/.pdf` is superseded
- [ ] All materials in **English** (UI, README, docs, video voiceover/captions, deck)

## Pre-submit sanity checks

### Deployed app
- [ ] https://skillcoach-aibc.web.app opens in an **incognito window** on a different device / network without login walls (or demo credentials are given in the form and README)
- [ ] The 3D customer avatar loads on the practice screen (initials fallback without WebGL)
- [ ] Demo scenarios load and a full session (practice turns + report) completes end to end
- [ ] Compliance flag, coach hint and citations all trigger with the lines in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- [ ] Scenario B line 2 triggers the Compliance Guard card ("Edit message" / "Send anyway") on the production URL
- [ ] Scenario B report shows the compliance gate failed (overall score capped at 59); report quotes are marked verified
- [ ] Persona approval works (`POST /api/personas/{id}/approve`), and a draft persona cannot back a scenario
- [ ] Cloud Run min instances set to 1 (or service pre-warmed) through the judging period to avoid cold starts
- [ ] The deployed prototype stays functional for the whole evaluation: no redeploys to a new project, URL changes or teardown until judging ends
- [ ] Billing account and Vertex AI quota will remain active through judging; budget alert configured
- [ ] Model check from [docs/deployment.md](docs/deployment.md) section 2 passes on deploy day (3.x models on `global`, embeddings in `asia-east1`)
- [ ] Works on mobile width and in Chrome, Edge, Safari (at least text mode)

### Video
- [ ] Duration between 3:00 and 4:00 (check the final exported file, not the timeline; `tools/video/compose.mjs` warns outside 3:00.5-3:59.5)
- [ ] Visibility is Public or Unlisted (Drive: "Anyone with the link can view")
- [ ] Opens in an incognito window
- [ ] Shows the live URL (https://skillcoach-aibc.web.app) and Gemini in action; captions enabled

### Repository
- [ ] Repository is **public**
- [ ] **No secrets committed**: no API keys, service account JSON, `.env` (only `.env.example`). Scan history, e.g. `git log -p | grep -iE "api[_-]?key|private_key|secret"` or gitleaks
- [ ] `.gitignore` covers `.env`, credentials, `node_modules`, `.venv`, build output
- [ ] README has live URL, video URL, quick start, deploy steps, architecture link, license (Apache-2.0), third-party licences (Rocketbox, three.js, three-vrm: MIT; see `NOTICE`)
- [ ] `LICENSE` file present (Apache-2.0, at the repository root)
- [ ] Only features that actually work are described as working; others marked "planned"
- [ ] No non-English text in code comments, UI strings, or docs
- [ ] No claim that data never leaves Taiwan; wording is "data at rest and embeddings in the chosen APAC region, Gemini generation via the Vertex AI global endpoint"

### Deck
- [ ] Uses the official AI Builder Cup submission template (`media/SkillCoach_Submission.pdf`)
- [ ] Exported as PDF; opens correctly; file size reasonable (< 20 MB)
- [ ] Every statistic has a source, or is removed
- [ ] Contains live URL and GitHub URL (in [docs/DECK.md](docs/DECK.md)), video URL, team names

### Form
- [ ] All links tested from the submitted form itself after submission
- [ ] Team member names and emails correct
- [ ] Confirmation email / portal status received
