# Submission brief

Text for the "brief description" field of the AI Builder Cup form. About 250 words, so it fits common form limits.

---

**SkillCoach** is an AI role-play coach for customer-facing teams in regulated industries (insurance, banking, sales and support). New hires practice realistic customer conversations before they meet real customers. Every practice customer, rule and score is grounded in the company's own documents.

An admin uploads manuals and policies. Gemini drafts customer personas and practice scenarios that cite the source passages, and a trainer approves them. During practice, a **Compliance Guard** checks each message before it is sent. It quotes the risky phrase (for example, "guarantees you 8% a year") and names the rule. A coach gives a one-line hint on every turn. In live call mode the trainee turns on the camera (with background blur or a virtual background) and simply talks to a 3D customer, who answers out loud, while on-device face tracking reads their expression and eye contact. The final report quotes the trainee's own words for every score, and one serious violation fails the session. Managers see who is ready to go live.

**How we use Google Cloud**

- **Gemini (Vertex AI, `google-genai` SDK):** seven agent roles per turn and session. Gemini 4 Argon voices the customer, builds personas and scenarios, and writes the report. Gemini 3.5 Flash-Lite runs the fast checks (compliance judge, grounding, trust state, coach). In live call mode, Gemini also looks at one webcam frame per turn and coaches eye contact, expression and posture (frames are not stored). We use structured JSON output, streaming, image input and `gemini-embedding-001` for retrieval. The server verifies every quote the model returns.
- **Veo and Gemini image generation:** the practice customers are fictional people whose portraits were generated with `gemini-3-pro-image` and animated with Veo 3.1 into looping listening, talking and unhappy clips, so the trainee talks to a lifelike person on a video call.
- **Cloud Run:** two stateless services, the Next.js web app and the FastAPI API. Replies stream over Server-Sent Events.
- **Firestore:** all application state: documents, embedded chunks, personas, scenarios, sessions and reports.
- **Firebase:** Firebase Hosting serves the public URL and rewrites every request to the Cloud Run web service. Firebase Authentication handles sign-up and sign-in (email and password, or guest); the API verifies the ID token and links practice sessions to each trainee.
