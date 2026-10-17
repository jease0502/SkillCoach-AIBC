"""Fill the official AI Builder Cup submission template with SkillCoach content.

    python tools/deck/build_submission_deck.py \
        --template "Submission Template _ AI Builder Cup.pptx" \
        --out media/SkillCoach_Submission.pptx \
        --team "Team name" --leader "Leader name" \
        --app-url https://... --video-url https://...

Unset values stay as visible [placeholders] so they are easy to spot.
Run from the repository root.
"""
from __future__ import annotations

import argparse
import copy
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

MEDIA = Path("media")
SHOTS = MEDIA / "deck"
LIVE_CACHE = MEDIA / "build" / "deck-live"


def live(name: str) -> Path:
    """A screenshot of the deployed app (tools/video/deck-shots.mjs), re-encoded as a
    1920-px JPEG so the deck stays small."""
    from PIL import Image as PILImage

    src = SHOTS / f"live_{name}.png"
    dst = LIVE_CACHE / f"{name}.jpg"
    if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
        dst.parent.mkdir(parents=True, exist_ok=True)
        im = PILImage.open(src).convert("RGB")
        im.thumbnail((1920, 1920), PILImage.LANCZOS)
        im.save(dst, "JPEG", quality=88, optimize=True)
    return dst

FONT = "Google Sans Flex"
FONT_MED = "Google Sans Flex Medium"
FONT_BOLD = "Google Sans Flex SemiBold"

INK = RGBColor(0x20, 0x21, 0x24)
MUTED = RGBColor(0x5F, 0x63, 0x68)
LINE = RGBColor(0xDA, 0xDC, 0xE0)
CARD = RGBColor(0xF1, 0xF3, 0xF4)
BLUE = RGBColor(0x1A, 0x73, 0xE8)
BLUE_BG = RGBColor(0xE8, 0xF0, 0xFE)
GREEN = RGBColor(0x18, 0x80, 0x38)
GREEN_BG = RGBColor(0xE6, 0xF4, 0xEA)
RED = RGBColor(0xC5, 0x22, 0x1F)
RED_BG = RGBColor(0xFC, 0xE8, 0xE6)
AMBER = RGBColor(0xB0, 0x60, 0x00)
AMBER_BG = RGBColor(0xFE, 0xF7, 0xE0)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

# Content area below the template's title row (title box sits at y=0.73).
X0, X1 = 0.35, 9.65
Y0 = 1.32


# ---------------------------------------------------------------- helpers

def _style(run, size, bold=False, color=INK, italic=False, font=None):
    run.font.size = Pt(size)
    run.font.name = font or (FONT_BOLD if bold else FONT)
    run.font.color.rgb = color
    run.font.italic = italic


def text(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP, align=PP_ALIGN.LEFT,
         margin=0.0, space_after=3, name=None):
    """paras: list of paragraphs; each is a str, a (str, opts) tuple, or a list of such runs."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for side in ("left", "right", "top", "bottom"):
        setattr(tf, f"margin_{side}", Inches(margin))
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        runs = para if isinstance(para, list) else [para]
        for r in runs:
            s, o = (r, {}) if isinstance(r, str) else r
            run = p.add_run()
            run.text = s
            _style(run, o.get("size", 12), o.get("bold", False), o.get("color", INK),
                   o.get("italic", False), o.get("font"))
            if o.get("link"):
                run.hyperlink.address = o["link"]
    return tb


def box(slide, x, y, w, h, fill=CARD, line=None, radius=0.08, shape=MSO_SHAPE.ROUNDED_RECTANGLE):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.shadow.inherit = False
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(0.75)
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = min(0.5, radius / min(w, h))
    s.text_frame.text = ""
    return s


def chip(slide, x, y, w, label, fill=BLUE_BG, color=BLUE, h=0.24, size=9):
    b = box(slide, x, y, w, h, fill=fill, radius=h / 2)
    tf = b.text_frame
    tf.margin_left = tf.margin_right = Inches(0.04)
    tf.margin_top = tf.margin_bottom = Inches(0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = label
    _style(r, size, True, color)
    return b


def circle_num(slide, x, y, n, d=0.32, fill=BLUE):
    c = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
    c.shadow.inherit = False
    c.fill.solid()
    c.fill.fore_color.rgb = fill
    c.line.fill.background()
    tf = c.text_frame
    for side in ("left", "right", "top", "bottom"):
        setattr(tf, f"margin_{side}", Inches(0))
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    _style(r, 11, True, WHITE)


def arrow(slide, x1, y1, x2, y2, color=MUTED):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color
    c.line.width = Pt(1.25)
    ln = c.line._get_or_add_ln()
    tail = ln.makeelement("{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd",
                          {"type": "triangle", "w": "med", "len": "med"})
    ln.append(tail)
    return c


def image(slide, path, x, y, w=None, h=None, border=True):
    kw = {}
    if w is not None:
        kw["width"] = Inches(w)
    if h is not None:
        kw["height"] = Inches(h)
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), **kw)
    if border:
        pic.line.color.rgb = LINE
        pic.line.width = Pt(0.75)
    return pic


def fit_image(slide, path, x, y, w, h, border=True):
    """Place an image inside a w x h frame, centered, keeping its aspect ratio."""
    from PIL import Image as PILImage
    iw, ih = PILImage.open(path).size
    scale = min(w / iw, h / ih)
    pw, ph = iw * scale, ih * scale
    return image(slide, path, x + (w - pw) / 2, y + (h - ph) / 2, w=pw, border=border)


def set_title(slide, title):
    """Replace the template's title text box (the one at y=0.73), keeping its font."""
    tb = next(s for s in slide.shapes if s.has_text_frame and abs(s.top / 914400 - 0.73) < 0.05)
    tf = tb.text_frame
    first = tf.paragraphs[0]
    for p in list(tf.paragraphs)[1:]:
        p._p.getparent().remove(p._p)
    runs = first.runs
    runs[0].text = title
    for r in runs[1:]:
        r._r.getparent().remove(r._r)
    tb.height = Inches(0.5)
    return tb


def caption(slide, x, y, w, s, h=0.22, size=8.5):
    return text(slide, x, y, w, h, [(s, {"size": size, "color": MUTED, "italic": True})])


def card_with_text(slide, x, y, w, h, title, body, fill=CARD, title_color=INK, size=10, title_size=11.5):
    box(slide, x, y, w, h, fill=fill)
    paras = [(title, {"size": title_size, "bold": True, "color": title_color})]
    for line in body if isinstance(body, list) else [body]:
        paras.append((line, {"size": size, "color": INK}))
    text(slide, x + 0.14, y + 0.1, w - 0.28, h - 0.2, paras, space_after=3)


def bullets(slide, x, y, w, h, items, size=10.5, color=INK, space_after=4):
    tb = text(slide, x, y, w, h, [(i, {"size": size, "color": color}) for i in items], space_after=space_after)
    for p in tb.text_frame.paragraphs:
        pPr = p._p.get_or_add_pPr()
        pPr.set("marL", str(int(Inches(0.16))))
        pPr.set("indent", str(-int(Inches(0.16))))
        bu = pPr.makeelement("{http://schemas.openxmlformats.org/drawingml/2006/main}buChar", {"char": "•"})
        pPr.append(bu)
    return tb


# ---------------------------------------------------------------- slides

def team_slide(slide, team, leader):
    tb = next(s for s in slide.shapes if s.has_text_frame and "Team Details" in s.text_frame.text)
    values = {
        "Team name:": team,
        "Team leader name:": leader,
        "Problem Statement:": (
            "Customer-facing staff in regulated industries learn on real customers, because realistic, "
            "scored practice needs senior people nobody can spare. One wrong sentence, such as "
            "\"this plan guarantees you 8% a year\", is a conduct failure. SkillCoach turns a company's own "
            "documents into AI practice customers with a pre-send Compliance Guard and evidence-verified scores."
        ),
    }
    for p in tb.text_frame.paragraphs:
        label = "".join(r.text for r in p.runs).strip()
        if label in values and p.runs:
            r0 = p.runs[-1]
            new = copy.deepcopy(r0._r)
            r0._r.addnext(new)
            new_run = p.runs[-1]
            new_run.text = " " + values[label]
            new_run.font.name = FONT
            if label == "Problem Statement:":
                new_run.font.size = Pt(11)
                for r in p.runs[:-1]:
                    r.font.size = Pt(13)
    # Shrink the label sizes a little so the problem statement fits above the bottom edge.
    for p in tb.text_frame.paragraphs:
        for r in p.runs:
            if r.font.size and r.font.size > Pt(13) and "Team Details" not in r.text:
                r.font.size = Pt(13)


def brief_slide(s):
    set_title(s, "Brief about the idea")
    text(s, X0, Y0, 5.1, 0.75, [
        [("SkillCoach: ", {"size": 20, "bold": True}),
         ("practice the conversation before it counts", {"size": 20, "bold": True, "color": BLUE})],
    ])
    rows = [
        ("Problem", "New hires in insurance, banking, sales and support learn on real customers. "
                    "Practice depends on senior colleagues, and one non-compliant sentence is a conduct failure."),
        ("Idea", "Upload manuals and policies; Gemini drafts realistic AI customers that cite the source passages. "
                 "A trainer approves them, and trainees practice any time with a 3D customer and a coach on every turn."),
        ("Trust", "A Compliance Guard holds a risky message before it is sent. Every score quotes the trainee's "
                  "own words, and one serious violation fails the session."),
        ("Built on", "Gemini on Vertex AI, Cloud Run, Firestore and Firebase Hosting. Theme: Future of Work & "
                     "Enterprise Productivity."),
    ]
    y = Y0 + 0.85
    for label, body in rows:
        chip(s, X0, y + 0.02, 0.9, label)
        text(s, X0 + 1.02, y, 4.1, 0.8, [(body, {"size": 10})])
        y += 0.8
    box(s, 5.75, Y0, 3.9, 3.95, fill=BLUE_BG, radius=0.12)
    text(s, 5.9, Y0 + 0.1, 3.6, 0.3, [("Live app: a 3D customer, and the Guard holds a risky message",
                                        {"size": 9.5, "bold": True, "color": BLUE})])
    fit_image(s, live("practice_guard"), 5.9, Y0 + 0.45, 3.6, 2.35)
    text(s, 5.9, Y0 + 2.95, 3.6, 0.9, [(
        "Mr. Tan, a cautious retiree, is rendered as a 3D customer. The trainee types a guaranteed-return "
        "promise; the Guard quotes the phrase, names rule CC-01 and offers Edit message or Send anyway.",
        {"size": 9.5, "color": INK})])


def opportunities_slide(s):
    set_title(s, "Opportunities")
    cols = [
        ("How is it different?", BLUE, [
            "Personas come from the company's own documents, with a citation on every hidden need and objection.",
            "A trainer approves each persona before anyone practices.",
            "A compliance gate with verbatim evidence: a great talk with one forbidden promise still fails.",
            "AI role-play tools (Hyperbound, Second Nature) focus on US B2B selling, not regulated APAC products.",
        ]),
        ("How it solves the problem", GREEN, [
            "Unlimited private practice with no senior colleague in the room.",
            "Mistakes are caught in practice, about 1 s before the message is sent, instead of in front of a customer.",
            "Managers see who is ready to go live from verified reports, not gut feel.",
            "Expert know-how becomes a scenario the whole team can practice.",
        ]),
        ("USP", RED, [
            "Documents in, approved and cited personas out, in under a minute.",
            "Seven Gemini agent roles per turn, each with its own schema and guardrail.",
            "The server, not the model, decides what counts as evidence: quotes must match the source or transcript.",
            "Data at rest in the customer's APAC region.",
        ]),
    ]
    w, gap = 2.98, 0.18
    for i, (title, color, items) in enumerate(cols):
        x = X0 + i * (w + gap)
        box(s, x, Y0, w, 3.3, fill=CARD)
        text(s, x + 0.16, Y0 + 0.12, w - 0.3, 0.35, [(title, {"size": 13, "bold": True, "color": color})])
        bullets(s, x + 0.16, Y0 + 0.55, w - 0.3, 3.0, items, size=10.5, space_after=6)
    caption(s, X0, Y0 + 3.45, 9.3,
            "Competitor focus from public positioning (Hyperbound US$15M Series A [S16]; Second Nature US$22M "
            "Series B [S17]). Sources on the Sources slide.")


def features_slide(s):
    set_title(s, "List of features offered by the solution")
    feats = [
        ("Persona builder", "Upload manuals; Gemini drafts customer personas and scenarios with citations to source passages."),
        ("Human approval", "Personas start as drafts. Only approved personas can back a practice scenario."),
        ("Live AI customer", "Streamed replies, hidden needs revealed only when trust is earned, facts limited to the knowledge base."),
        ("Compliance Guard", "Checks each message before it is sent, quotes the phrase and names the rule. Edit or send anyway."),
        ("Coach on every turn", "A one-sentence hint grounded in the company playbook, with knowledge-base citations."),
        ("Trust and patience meters", "The customer's state updates every turn, so trainees see the effect of their words."),
        ("Evidence-verified report", "Each score quotes the trainee's words. No verified evidence caps a skill at 50; a serious violation caps the total at 59."),
        ("Manager readiness view", "Team dashboard: ready-to-go-live count, weakest skills and top compliance violations."),
        ("3D customer and voice", "A 3D customer that lip-syncs, blinks and shows its mood from the trust meter; speech input and spoken replies."),
    ]
    w, h, gx, gy = 2.98, 1.12, 0.18, 0.14
    for i, (t, b) in enumerate(feats):
        x = X0 + (i % 3) * (w + gx)
        y = Y0 + (i // 3) * (h + gy)
        box(s, x, y, w, h, fill=CARD)
        circle_num(s, x + 0.14, y + 0.13, i + 1, d=0.28)
        text(s, x + 0.52, y + 0.12, w - 0.62, 0.3, [(t, {"size": 11.5, "bold": True})])
        text(s, x + 0.14, y + 0.45, w - 0.26, h - 0.5, [(b, {"size": 9.5, "color": INK})])


def process_slide(s):
    set_title(s, "Process flow diagram")
    steps = [
        ("Build", "Admin / trainer", live("persona_detail"),
         ["Upload manuals and policies", "Gemini drafts personas + scenarios with citations",
          "Trainer reviews and approves"]),
        ("Practice", "Trainee", live("practice_guard"),
         ["Guard pre-checks each message (~1 s)", "AI customer streams a reply",
          "Grounding, state and coach run in parallel"]),
        ("Prove", "Manager", live("report"),
         ["Report with verified quotes", "Compliance gate (pass / fail)",
          "Readiness dashboard: who can go live"]),
    ]
    w, gap = 2.82, 0.42
    for i, (title, role, img, items) in enumerate(steps):
        x = X0 + i * (w + gap)
        circle_num(s, x, Y0, i + 1)
        text(s, x + 0.42, Y0 - 0.02, 1.2, 0.36, [(title, {"size": 15, "bold": True})], anchor=MSO_ANCHOR.MIDDLE)
        chip(s, x + w - 1.3, Y0 + 0.04, 1.3, role)
        fit_image(s, img, x, Y0 + 0.48, w, 1.6)
        bullets(s, x, Y0 + 2.2, w, 1.4, items, size=10.5, space_after=5)
        if i < 2:
            arrow(s, x + w + 0.07, Y0 + 1.28, x + w + gap - 0.07, Y0 + 1.28, color=BLUE)
    caption(s, X0, Y0 + 3.8, 9.3,
            "Screens from the deployed app: a persona grounded in cited sources, the 3D customer with the "
            "Compliance Guard card, and the evidence-verified report.")


def wireframes_slide(s):
    set_title(s, "Wireframes / mock diagrams of the proposed solution")
    shots = [
        (live("home"), "Home: what SkillCoach does, start the 3-minute demo"),
        (live("knowledge"), "Knowledge base: upload manuals and policies, test a search"),
        (live("persona_new"), "Persona builder: describe, generate from documents, or fill in"),
        (live("scenarios"), "Scenarios: one customer, rubric and rules each"),
    ]
    w, h, gx = 4.56, 1.78, 0.18
    for i, (img, cap) in enumerate(shots):
        x = X0 + (i % 2) * (w + gx)
        y = Y0 + (i // 2) * (h + 0.32)
        fit_image(s, img, x, y, w, h - 0.02)
        caption(s, x, y + h + 0.01, w, cap, size=9)


def architecture_slide(s):
    set_title(s, "Architecture diagram of the proposed solution")

    def node(x, y, w, h, title, sub, fill=WHITE, line=LINE, tc=INK, sc=MUTED):
        box(s, x, y, w, h, fill=fill, line=line)
        text(s, x + 0.1, y + 0.06, w - 0.2, h - 0.1,
             [(title, {"size": 10.5, "bold": True, "color": tc}), (sub, {"size": 8.5, "color": sc})],
             space_after=1)

    # Google Cloud region frame
    box(s, 1.55, Y0 - 0.02, 5.75, 2.55, fill=BLUE_BG, radius=0.1)
    text(s, 1.68, Y0 + 0.02, 4.5, 0.25, [("Google Cloud · asia-east1", {"size": 9, "bold": True, "color": BLUE})])

    node(X0, Y0 + 0.75, 1.05, 0.8, "Browser", "trainee, admin, manager")
    node(1.7, Y0 + 0.35, 1.65, 0.72, "Firebase Hosting", "public URL, rewrites to Cloud Run")
    node(3.55, Y0 + 0.35, 1.65, 0.72, "Cloud Run: web", "Next.js 15")
    node(5.4, Y0 + 0.35, 1.75, 0.72, "Cloud Run: api", "FastAPI, Server-Sent Events")
    node(1.7, Y0 + 1.5, 2.55, 0.85, "Firestore", "documents, chunks + vectors, personas, scenarios, sessions, reports")
    node(4.45, Y0 + 1.5, 2.7, 0.85, "gemini-embedding-001", "Vertex AI, same region; retrieval ~0.25 s")
    box(s, 7.5, Y0 - 0.02, 2.15, 2.55, fill=BLUE, radius=0.1)
    text(s, 7.62, Y0 + 0.08, 1.95, 2.4, [
        ("Vertex AI: Gemini", {"size": 11.5, "bold": True, "color": WHITE}),
        ("global endpoint, google-genai SDK", {"size": 8.5, "color": WHITE}),
        ("Gemini 4 Argon: customer, builder, report", {"size": 9, "color": WHITE}),
        ("Gemini 3.5 Flash-Lite: guard, grounding, state, coach", {"size": 9, "color": WHITE}),
        ("Fallback chains keep the service up if a model fails", {"size": 9, "color": WHITE}),
    ], space_after=5)

    arrow(s, X0 + 1.05, Y0 + 1.0, 1.7, Y0 + 0.72)
    arrow(s, 3.35, Y0 + 0.71, 3.55, Y0 + 0.71)
    arrow(s, 5.2, Y0 + 0.71, 5.4, Y0 + 0.71)
    arrow(s, 7.15, Y0 + 0.71, 7.5, Y0 + 0.71)
    arrow(s, 5.9, Y0 + 1.07, 3.6, Y0 + 1.5)
    arrow(s, 6.3, Y0 + 1.07, 6.3, Y0 + 1.5)

    # Per-turn pipeline
    text(s, X0, Y0 + 2.68, 9.3, 0.25, [("Per-turn pipeline: one streamed HTTP request, measured on the live service",
                                         {"size": 10, "bold": True})])
    stages = [("Compliance pre-check", "~1 s"), ("Retrieval", "~0.25 s"), ("Customer reply streams", "first token 2-2.7 s"),
              ("3 checks in parallel", "grounding, state, coach"), ("Done", "full turn ~5 s")]
    w, gap = 1.7, 0.2
    for i, (t, v) in enumerate(stages):
        x = X0 + i * (w + gap)
        last = i == len(stages) - 1
        node(x, Y0 + 2.98, w, 0.62, t, v, fill=BLUE if last else WHITE, line=None if last else LINE,
             tc=WHITE if last else INK, sc=WHITE if last else BLUE)
        if not last:
            arrow(s, x + w + 0.02, Y0 + 3.29, x + w + gap - 0.02, Y0 + 3.29)
    caption(s, X0, Y0 + 3.7, 9.3,
            "Data at rest and embeddings stay in asia-east1; Gemini generation runs on the Vertex AI global endpoint [S27].")


def technologies_slide(s):
    set_title(s, "Technologies used in the solution")
    rows = [
        ("Agent role", "Model", "Guardrail"),
        ("Persona & scenario builder", "Gemini 4 Argon", "Citation quotes must match the source chunk; human approval"),
        ("Compliance Guard", "3.5 Flash-Lite", "Flag quote must be an exact span of the message"),
        ("Customer persona (streamed)", "Gemini 4 Argon", "Hidden needs held until trust is earned"),
        ("Grounding post-check", "3.5 Flash-Lite", "Flags product claims the KB doesn't support"),
        ("State: trust / patience", "3.5 Flash-Lite", "Deltas clamped; violations always cost trust"),
        ("Coach", "3.5 Flash-Lite", "One sentence with KB citations"),
        ("Report scorer", "Gemini 4 Argon", "Verbatim evidence or capped at 50; gate at 59"),
    ]
    tw = 5.9
    tbl = s.shapes.add_table(len(rows), 3, Inches(X0), Inches(Y0), Inches(tw), Inches(3.4)).table
    widths = [1.95, 1.2, 2.75]
    for j, wd in enumerate(widths):
        tbl.columns[j].width = Inches(wd)
    for i, row in enumerate(rows):
        tbl.rows[i].height = Inches(0.36)
        for j, val in enumerate(row):
            cell = tbl.cell(i, j)
            cell.margin_left = cell.margin_right = Inches(0.06)
            cell.margin_top = cell.margin_bottom = Inches(0.03)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            cell.fill.fore_color.rgb = INK if i == 0 else (CARD if i % 2 == 0 else WHITE)
            tf = cell.text_frame
            tf.word_wrap = True
            r = tf.paragraphs[0].add_run()
            r.text = val
            color = WHITE if i == 0 else (BLUE if (j == 1 and "Argon" in val) else (GREEN if j == 1 else INK))
            _style(r, 8.5 if i else 9, bold=(i == 0 or j < 2), color=color)
    caption(s, X0, Y0 + 3.5, tw,
            "Fallbacks: Argon → 3.8 Flash; report → 3.1 Pro → 2.5 Pro. Thinking level low on every agent.")

    x = X0 + tw + 0.2
    w = X1 - x
    box(s, x, Y0, w, 3.8, fill=CARD)
    paras = [("How we use Google Cloud", {"size": 12, "bold": True})]
    for head, body in [
        ("Gemini", "seven agent roles via Vertex AI (google-genai SDK), structured JSON output, streaming, embeddings."),
        ("Cloud Run", "two stateless services: Next.js web and FastAPI API, autoscaling, min 1 instance."),
        ("Firestore", "all state: documents, vector chunks, personas, scenarios, sessions, reports."),
        ("Firebase", "Hosting serves the public URL and rewrites traffic to Cloud Run."),
        ("Also", "Python 3.12, Next.js 15, React, Server-Sent Events, Web Speech API."),
    ]:
        paras.append([(head + ": ", {"size": 9.5, "bold": True, "color": BLUE}), (body, {"size": 9.5})])
    text(s, x + 0.14, Y0 + 0.12, w - 0.26, 3.6, paras, space_after=6)


def cost_slide(s):
    set_title(s, "Estimated implementation cost")
    tiles = [
        ("US$0.05-0.20", "model cost per 15-20 turn practice session"),
        ("< US$2", "model cost per seat per month at 8 sessions per rep"),
        ("US$25", "price per active seat per month (Team plan hypothesis)"),
    ]
    w, gap = 2.98, 0.18
    for i, (v, l) in enumerate(tiles):
        x = X0 + i * (w + gap)
        box(s, x, Y0, w, 1.05, fill=BLUE_BG)
        text(s, x + 0.16, Y0 + 0.08, w - 0.3, 0.5, [(v, {"size": 22, "bold": True, "color": BLUE})])
        text(s, x + 0.16, Y0 + 0.6, w - 0.3, 0.4, [(l, {"size": 9.5})])

    y = Y0 + 1.3
    text(s, X0, y, 5.0, 0.3, [("Customer view: 100-rep team, per year (estimate)", {"size": 11.5, "bold": True})])
    bar_x, full = X0 + 0.75, 3.5
    scale = full / 126
    text(s, X0, y + 0.45, 0.7, 0.32, [("Value", {"size": 10, "bold": True})], anchor=MSO_ANCHOR.MIDDLE)
    seg_x = bar_x
    for v, c in [(48, BLUE), (62.5, RGBColor(0x4C, 0x8D, 0xF6)), (15.5, RGBColor(0xA8, 0xC7, 0xFA))]:
        box(s, seg_x, y + 0.45, v * scale, 0.32, fill=c, radius=0.0, shape=MSO_SHAPE.RECTANGLE)
        seg_x += v * scale
    text(s, seg_x + 0.08, y + 0.45, 1.2, 0.32, [("~US$126k", {"size": 10, "bold": True})], anchor=MSO_ANCHOR.MIDDLE)
    text(s, X0, y + 0.9, 0.7, 0.32, [("Cost", {"size": 10, "bold": True})], anchor=MSO_ANCHOR.MIDDLE)
    box(s, bar_x, y + 0.9, 40 * scale, 0.32, fill=LINE, radius=0.0, shape=MSO_SHAPE.RECTANGLE)
    text(s, bar_x + 40 * scale + 0.08, y + 0.9, 2.5, 0.32, [("~US$40k · roughly 3x", {"size": 10, "bold": True})],
         anchor=MSO_ANCHOR.MIDDLE)
    text(s, X0, y + 1.32, 5.3, 0.9, [
        ("Value: manager time US$48k, faster ramp US$62.5k, lower attrition US$15k. Cost: 100 seats x US$25 x 12 "
         "plus ~US$10k onboarding.", {"size": 9.5}),
        ("Coaching time alone only breaks even; the case rests on ramp and retention, which the pilot measures.",
         {"size": 9.5, "italic": True, "color": MUTED}),
    ], space_after=4)

    x = X0 + 5.55
    w = X1 - x
    box(s, x, y, w, 2.45, fill=CARD)
    text(s, x + 0.14, y + 0.1, w - 0.26, 2.3, [
        ("Build and run cost", {"size": 11.5, "bold": True}),
        ("No custom model training, no servers to manage: managed Gemini, Cloud Run and Firestore.", {"size": 9.5}),
        ("Per-turn judgments use Flash-Lite; Gemini 4 Argon only where quality shows.", {"size": 9.5}),
        ("Onboarding a tenant = upload documents, approve personas, review a scenario.", {"size": 9.5}),
        ("Paid 8-week pilot: US$5k-10k. Enterprise: US$35-45 per seat with SSO and region pinning.", {"size": 9.5}),
    ], space_after=5)
    caption(s, X0, Y0 + 3.85, 9.3, "All figures are our own estimates and pricing hypotheses (docs/BUSINESS_CASE.md).")


SNAPSHOT_PAGES = [
    ("Snapshots of the prototype: practice", [
        ("practice_start", "Mr. Tan as a 3D customer: he blinks, breathes, keeps eye contact and lip-syncs. "
                           "His mood follows the trust and patience meters."),
        ("practice_guard", "\"This plan guarantees you 8% a year\" is held before it is sent: the Guard quotes the "
                           "words, names rule CC-01, and offers Edit message or Send anyway."),
    ]),
    ("Snapshots of the prototype: coaching and the report", [
        ("practice_session", "Later in the session: trust has dropped, the coach suggests the next move, and every "
                             "customer reply cites the knowledge base."),
        ("report", "The report: one high-severity violation fails the compliance gate and caps the score "
                   "(28 here), however good the rest was."),
    ]),
    ("Snapshots of the prototype: evidence", [
        ("report_evidence", "Skills, with evidence: each score quotes the trainee's own words; select a quote to "
                            "jump to that turn in the transcript."),
        ("report_violations", "Compliance violations name the rule and the exact phrase; strengths and next steps "
                              "turn the grade into a coaching plan."),
    ]),
    ("Snapshots of the prototype: knowledge and team", [
        ("persona_detail", "An approved persona: profile, hidden needs and objections, each grounded in cited "
                           "source passages."),
        ("dashboard", "Manager readiness view: who is ready to go live, weakest skills, top violations "
                      "(sample team data, labeled in the app)."),
    ]),
]


def snapshots_slide(s, title, shots):
    set_title(s, title)
    w, gx = 4.56, 0.18
    h = w * 900 / 1440
    for i, (name, cap) in enumerate(shots):
        x = X0 + i * (w + gx)
        fit_image(s, live(name), x, Y0, w, h)
        text(s, x, Y0 + h + 0.12, w, 0.9, [(cap, {"size": 10, "color": INK})])


def performance_slide(s):
    set_title(s, "Prototype performance report / benchmarking")
    tiles = [("~1 s", "Compliance Guard"), ("2.0-2.7 s", "first streamed token"), ("~5 s", "full turn"),
             ("~6 s", "end-of-session report"), ("106 / 106", "builder citations verified")]
    w, gap = 1.72, 0.17
    for i, (v, l) in enumerate(tiles):
        x = X0 + i * (w + gap)
        box(s, x, Y0, w, 0.95, fill=BLUE_BG)
        text(s, x + 0.12, Y0 + 0.07, w - 0.2, 0.45, [(v, {"size": 19, "bold": True, "color": BLUE})])
        text(s, x + 0.12, Y0 + 0.56, w - 0.2, 0.35, [(l, {"size": 9.5})])
    caption(s, X0, Y0 + 1.0, 9.3,
            "Measured on the deployed Cloud Run build with real Gemini (Gemini 4 Argon, 3.5 Flash-Lite), 2026-10-16. "
            "Persona generation: 18-40 s.")

    y = Y0 + 1.38
    text(s, X0, y, 9.3, 0.3, [("Three demo scenarios, same engine, three industries", {"size": 11.5, "bold": True})])
    cards = [
        ("A  SaaS sales: pricing objection", "94", "Compliance PASS", GREEN, GREEN_BG,
         "Uncovers the real concern (adoption, not price) and books a pilot on a fixed date."),
        ("B  Insurance: guaranteed-return trap", "FAIL", "Score capped: 30", RED, RED_BG,
         "\"Guarantees you 8% a year\" held by the Guard (CC-01, high); sent anyway, the session fails."),
        ("C  Support escalation", "68", "Compliance passed", AMBER, AMBER_BG,
         "Refund promise flagged (RR-01); trainee recovers and the customer reveals the birthday gift."),
    ]
    w, gap = 2.98, 0.18
    for i, (t, big, sub, c, bg, body) in enumerate(cards):
        x = X0 + i * (w + gap)
        box(s, x, y + 0.38, w, 2.0, fill=CARD)
        text(s, x + 0.14, y + 0.46, w - 0.26, 0.3, [(t, {"size": 10.5, "bold": True})])
        box(s, x + 0.14, y + 0.82, w - 0.28, 0.66, fill=bg)
        text(s, x + 0.24, y + 0.86, 1.1, 0.58, [(big, {"size": 24, "bold": True, "color": c})], anchor=MSO_ANCHOR.MIDDLE)
        text(s, x + 1.3, y + 0.86, w - 1.5, 0.58, [(sub, {"size": 10, "bold": True, "color": c})], anchor=MSO_ANCHOR.MIDDLE)
        text(s, x + 0.14, y + 1.56, w - 0.26, 0.8, [(body, {"size": 9})])


def future_slide(s):
    set_title(s, "Additional details / future development")
    cols = [
        ("Now (shipped)", True, ["Text practice with a 3D AI customer", "Browser voice: speech input, spoken replies",
                                 "Document-generated personas with citations and approval",
                                 "Multi-agent turns: guard, customer, grounding, state, coach",
                                 "Evidence-verified reports, manager readiness view"]),
        ("Next (planned)", False, ["Gemini Live native voice", "Avatar lip-sync from real audio", "On-device emotion cues", "More APAC languages"]),
        ("Later (planned)", False, ["LMS and CRM integration", "Scenarios from anonymized real calls",
                                    "Certification tracks", "Calibration against senior assessors"]),
    ]
    w, gap = 2.98, 0.18
    for i, (t, now, items) in enumerate(cols):
        x = X0 + i * (w + gap)
        box(s, x, Y0, w, 2.3, fill=BLUE if now else WHITE, line=None if now else BLUE)
        text(s, x + 0.16, Y0 + 0.1, w - 0.3, 0.32, [(t, {"size": 13, "bold": True, "color": WHITE if now else BLUE})])
        bullets(s, x + 0.16, Y0 + 0.5, w - 0.3, 1.75, items, size=9.5, color=WHITE if now else INK, space_after=3)

    y = Y0 + 2.48
    card_with_text(s, X0, y, 2.98, 1.35, "+34% for novices",
                   "AI assistance raised issues resolved per hour by 34% for novice support agents (14% on average) [S3]. "
                   "New hires are our users.", fill=GREEN_BG, title_color=GREEN, size=9)
    card_with_text(s, X0 + 3.16, y, 2.98, 1.35, "Beachhead: Singapore",
                   "About 19,000 insurance agents [S30] sell in English under MAS fair-dealing rules [S29]. "
                   "Then the Philippines and Hong Kong.", size=9)
    card_with_text(s, X0 + 6.32, y, 2.98, 1.35, "Next step: a paid pilot",
                   "8 weeks with a control cohort. KPIs: time to first solo call, flags per 100 turns, "
                   "manager hours per recruit.", size=9)


def links_slide(s, repo, video, app):
    set_title(s, "Links")
    items = [
        ("GitHub public repository", repo, BLUE),
        ("Demo video", video, RED),
        ("Final product link", app, GREEN),
    ]
    y = Y0 + 0.1
    for label, url, color in items:
        box(s, X0, y, 9.3, 0.95, fill=CARD)
        text(s, X0 + 0.25, y + 0.12, 4.0, 0.3, [(label, {"size": 12, "bold": True, "color": color})])
        opts = {"size": 14, "color": INK}
        if url.startswith("http"):
            opts["link"] = url
        text(s, X0 + 0.25, y + 0.45, 8.8, 0.4, [(url, opts)])
        y += 1.12
    caption(s, X0, y + 0.02, 9.3,
            "The product link opens without login. Demo scenarios A, B and C are preloaded; the dashboard includes "
            "labeled sample team data.", size=9.5)


SOURCES = [
    ("S1", "ATD, State of the Industry benchmarks (2024 and 2025 reports)",
     "https://www.td.org/content/atd-blog/benchmarks-and-trends-from-the-2025-state-of-the-industry-report"),
    ("S3", "Brynjolfsson, Li, Raymond, Generative AI at Work, NBER w31161; QJE 2025",
     "https://www.nber.org/papers/w31161"),
    ("S6", "Philippine contact center attrition (newsbytes.ph)",
     "https://newsbytes.ph/2024/05/28/attrition-rates-in-ph-contact-center-firms-continue-to-go-down/"),
    ("S7", "Contact center attrition 2024 (NICE 39% global), as reported",
     "https://stealthagents.com/research/bpo-agent-attrition-statistics-2026"),
    ("S9", "NCU thesis citing FSC Insurance Bureau: first-year retention of new life-insurance reps below 50%",
     "https://etd.lib.ncu.edu.tw/detail/56554d0867235710166b1752acffa4ba"),
    ("S16", "Hyperbound US$15M Series A (Sept 2025)", "https://www.hyperbound.ai/blog/series-a"),
    ("S17", "Second Nature US$22M Series B (Oct 2025)",
     "https://pulse2.com/second-nature-22-million-series-b-raised-for-expanding-ai-based-sales-and-service-training"),
    ("S20", "HKMA press release: Hang Seng Bank fined HK$66.4M (27 Jan 2025)",
     "https://www.hkma.gov.hk/eng/news-and-media/press-releases/2025/01/20250127-4"),
    ("S27", "Google Cloud: Vertex AI generative AI data residency (checked 2026-10-15)",
     "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency"),
    ("S29", "MAS Guidelines on Fair Dealing (FAA-G11, May 2024)",
     "https://www.mas.gov.sg/-/media/mas-media-library/fair-dealing-guidelines-30-may-2024.pdf"),
    ("S30", "Insurance Business Asia: Singapore insurance agent numbers (~19,000)",
     "https://www.insurancebusinessmag.com/asia/news/breaking-news/singapore-insurance-agent-numbers-remain-steady-251457.aspx"),
]


def sources_slide(s, title_template_slide):
    # Slide 15 of the template has no title box: copy one from another content slide.
    src = next(sh for sh in title_template_slide.shapes if sh.has_text_frame and abs(sh.top / 914400 - 0.73) < 0.05)
    s.shapes._spTree.append(copy.deepcopy(src._element))
    set_title(s, "Sources")
    half = (len(SOURCES) + 1) // 2
    for col, chunk in enumerate([SOURCES[:half], SOURCES[half:]]):
        x = X0 + col * 4.75
        y = Y0
        for tag, label, url in chunk:
            text(s, x, y, 0.45, 0.6, [(tag, {"size": 9, "bold": True, "color": BLUE})])
            text(s, x + 0.45, y, 4.1, 0.6, [(label, {"size": 8.5}),
                                            (url, {"size": 7, "color": MUTED, "link": url})], space_after=1)
            y += 0.63
    caption(s, X0, 5.1, 9.3, "Figures marked (estimate) are our own model. Full list with notes: docs/BUSINESS_CASE.md, section 12.")


# ---------------------------------------------------------------- main

def duplicate_slide(prs, index):
    """Copy slide `index` (the template frame: header and footer art) right after itself."""
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT

    r_embed = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
    src = prs.slides[index]
    new = prs.slides.add_slide(src.slide_layout)
    for shp in list(new.shapes):
        shp._element.getparent().remove(shp._element)
    for shp in src.shapes:
        el = copy.deepcopy(shp._element)
        for blip in el.xpath(".//a:blip"):
            blip.set(r_embed, new.part.relate_to(src.part.related_part(blip.get(r_embed)), RT.IMAGE))
        new.shapes._spTree.append(el)
    ids = prs.slides._sldIdLst
    moved = list(ids)[-1]
    ids.remove(moved)
    ids.insert(index + 1, moved)
    return new


def delete_slide(prs, index):
    sld_ids = prs.slides._sldIdLst
    sld = list(sld_ids)[index]
    prs.part.drop_rel(sld.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"))
    sld_ids.remove(sld)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", default="Submission Template _ AI Builder Cup.pptx")
    ap.add_argument("--out", default="media/SkillCoach_Submission.pptx")
    ap.add_argument("--team", default="[Team name]")
    ap.add_argument("--leader", default="[Team leader name]")
    ap.add_argument("--repo-url", default="https://github.com/jease0502/SkillCoach-AIBC")
    ap.add_argument("--video-url", default="[Demo video URL]")
    ap.add_argument("--app-url", default="https://skillcoach-aibc.web.app")
    a = ap.parse_args()

    prs = Presentation(a.template)
    # The template has one "Snapshots of the prototype" slide (index 10); add more.
    for _ in SNAPSHOT_PAGES[1:]:
        duplicate_slide(prs, 10)
    sl = list(prs.slides)
    extra = len(SNAPSHOT_PAGES) - 1
    team_slide(sl[0], a.team, a.leader)
    brief_slide(sl[2])
    opportunities_slide(sl[3])
    features_slide(sl[4])
    process_slide(sl[5])
    wireframes_slide(sl[6])
    architecture_slide(sl[7])
    technologies_slide(sl[8])
    cost_slide(sl[9])
    for i, (title, shots) in enumerate(SNAPSHOT_PAGES):
        snapshots_slide(sl[10 + i], title, shots)
    performance_slide(sl[11 + extra])
    future_slide(sl[12 + extra])
    links_slide(sl[13 + extra], a.repo_url, a.video_url, a.app_url)
    sources_slide(sl[14 + extra], sl[2])
    delete_slide(prs, 1)  # the template's "how to download" instruction slide
    prs.save(a.out)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
