'use client';

/**
 * On-device camera processing for live calls, with MediaPipe Tasks Vision:
 * - Selfie segmentation for background blur / virtual backgrounds.
 * - Face Landmarker blendshapes -> expression and emotion cues, eye contact and head pose.
 * Frames never leave the browser; only the per-turn summary (and one frame for the
 * Gemini delivery check) is sent. Models are self-hosted in public/mediapipe/.
 */
import type { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';

export type BackgroundMode = 'none' | 'blur' | 'office' | 'branch' | 'study';
export const BACKGROUNDS: { id: BackgroundMode; label: string }[] = [
  { id: 'none', label: 'No effect' },
  { id: 'blur', label: 'Blur' },
  { id: 'office', label: 'Office' },
  { id: 'branch', label: 'Branch' },
  { id: 'study', label: 'Study' },
];

export const EMOTIONS = ['happy', 'neutral', 'surprised', 'sad', 'angry', 'fearful', 'disgusted', 'contempt'] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const EMOTION_LABEL: Record<Emotion, string> = {
  happy: 'Happy',
  neutral: 'Neutral',
  surprised: 'Surprised',
  sad: 'Sad',
  angry: 'Angry',
  fearful: 'Fearful',
  disgusted: 'Disgusted',
  contempt: 'Contempt',
};

export interface FaceCues {
  face: boolean;
  emotions: Record<Emotion, number>;
  dominant: Emotion;
  /** 0-1: eyes on the camera and head roughly facing it. */
  eyeContact: number;
  /** Degrees: + is looking to the trainee's left / down. */
  yaw: number;
  pitch: number;
  smile: number;
  browFurrow: number;
  blink: boolean;
}

/** Per-turn summary sent with the delivery check. */
export interface CueSummary {
  frames: number;
  face_visible: number; // share of frames with a face, 0-1
  eye_contact: number; // average, 0-1
  dominant: Emotion;
  emotions: Record<Emotion, number>; // average scores
  blinks_per_min: number;
  smile: number;
  brow_furrow: number;
}

const WASM = '/mediapipe/wasm';
const FACE_MODEL = '/mediapipe/face_landmarker.task';
const SEG_MODEL = '/mediapipe/selfie_segmenter.tflite';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const zeroEmotions = (): Record<Emotion, number> => Object.fromEntries(EMOTIONS.map((e) => [e, 0])) as Record<Emotion, number>;

/** Emotion rules on blendshapes (ported from the emotion_webcam prototype's expressions.py). */
export function emotionsFromBlendshapes(bs: Record<string, number>): { emotions: Record<Emotion, number>; smile: number; browFurrow: number; look: number } {
  const g = (k: string) => bs[k] ?? 0;
  const pair = (a: string, b: string) => (g(a) + g(b)) / 2;
  const f = {
    browDown: pair('browDownLeft', 'browDownRight'),
    browInnerUp: g('browInnerUp'),
    browOuterUp: pair('browOuterUpLeft', 'browOuterUpRight'),
    squint: pair('eyeSquintLeft', 'eyeSquintRight'),
    wide: pair('eyeWideLeft', 'eyeWideRight'),
    lookDown: pair('eyeLookDownLeft', 'eyeLookDownRight'),
    lookUp: pair('eyeLookUpLeft', 'eyeLookUpRight'),
    lookSide: Math.max((g('eyeLookOutLeft') + g('eyeLookInRight')) / 2, (g('eyeLookInLeft') + g('eyeLookOutRight')) / 2),
    smile: pair('mouthSmileLeft', 'mouthSmileRight'),
    smileL: g('mouthSmileLeft'),
    smileR: g('mouthSmileRight'),
    dimple: pair('mouthDimpleLeft', 'mouthDimpleRight'),
    cheekSquint: pair('cheekSquintLeft', 'cheekSquintRight'),
    frown: pair('mouthFrownLeft', 'mouthFrownRight'),
    press: pair('mouthPressLeft', 'mouthPressRight'),
    stretch: pair('mouthStretchLeft', 'mouthStretchRight'),
    upperUp: pair('mouthUpperUpLeft', 'mouthUpperUpRight'),
    jawOpen: g('jawOpen'),
    sneer: pair('noseSneerLeft', 'noseSneerRight'),
  };
  const asym = Math.abs(f.smileL - f.smileR);
  const activation = Math.max(f.smile, asym, f.frown, f.browDown, f.browInnerUp, f.browOuterUp, f.wide, f.squint, f.jawOpen * 0.6, f.press, f.stretch, f.sneer, f.upperUp);
  const emotions: Record<Emotion, number> = {
    happy: clamp(0.75 * f.smile + 0.35 * f.cheekSquint + 0.15 * f.dimple - 0.5 * f.frown),
    sad: clamp(0.6 * f.frown + 0.5 * f.browInnerUp + 0.2 * f.lookDown - 0.8 * f.smile),
    angry: clamp(0.65 * f.browDown + 0.35 * f.squint + 0.25 * f.press + 0.2 * f.sneer - 0.7 * f.smile - 0.4 * f.browInnerUp),
    surprised: clamp(0.45 * f.browInnerUp + 0.35 * f.browOuterUp + 0.4 * f.wide + 0.35 * f.jawOpen - 0.6 * f.browDown),
    fearful: clamp(0.4 * f.browInnerUp + 0.35 * f.wide + 0.45 * f.stretch + 0.2 * f.jawOpen - 0.6 * f.smile),
    disgusted: clamp(0.7 * f.sneer + 0.4 * f.upperUp + 0.25 * f.browDown - 0.5 * f.smile),
    contempt: clamp(1.2 * asym + 0.25 * f.dimple - 0.4 * Math.min(f.smileL, f.smileR)),
    neutral: clamp(1 - 1.6 * activation),
  };
  return { emotions, smile: f.smile, browFurrow: f.browDown, look: Math.max(f.lookSide, f.lookDown, f.lookUp) };
}

/** Head yaw/pitch in degrees from the facial transformation matrix (column-major 4x4). */
function headAngles(m: number[]): { yaw: number; pitch: number } {
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];
  const yaw = (Math.atan2(-r20, Math.hypot(r21, r22)) * 180) / Math.PI;
  const pitch = (Math.atan2(r21, r22) * 180) / Math.PI;
  return { yaw, pitch };
}

let visionPromise: Promise<{ face: FaceLandmarker; seg: ImageSegmenter }> | null = null;

async function loadVision() {
  visionPromise ??= (async () => {
    const { FilesetResolver, FaceLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM);
    const make = async <T,>(fn: (delegate: 'GPU' | 'CPU') => Promise<T>) => {
      try {
        return await fn('GPU');
      } catch {
        return fn('CPU');
      }
    };
    const face = await make((delegate) =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
    );
    const seg = await make((delegate) =>
      ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }),
    );
    return { face, seg };
  })();
  return visionPromise;
}

const bgImages = new Map<BackgroundMode, HTMLImageElement>();
function backgroundImage(mode: BackgroundMode): HTMLImageElement | null {
  if (mode === 'none' || mode === 'blur') return null;
  let img = bgImages.get(mode);
  if (!img) {
    img = new Image();
    img.src = `/backgrounds/${mode}.jpg`;
    bgImages.set(mode, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/**
 * Runs segmentation and face analysis on a playing <video>, drawing the processed
 * picture into `canvas`. Returns a stop function.
 */
export function startFaceVision(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  opts: { background: () => BackgroundMode; onCues: (c: FaceCues) => void; onError?: (msg: string) => void },
): () => void {
  let stopped = false;
  let frame = 0;
  let lastTs = -1;
  let tick = 0;
  const smooth = { emotions: zeroEmotions(), eye: 0, yaw: 0, pitch: 0, smile: 0, furrow: 0 };
  const ctx = canvas.getContext('2d');
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d');
  const person = document.createElement('canvas');
  const pctx = person.getContext('2d');
  let vision: { face: FaceLandmarker; seg: ImageSegmenter } | null = null;

  loadVision()
    .then((v) => {
      vision = v;
    })
    .catch(() => opts.onError?.('Background effects and expression cues are unavailable in this browser.'));

  const draw = () => {
    if (stopped) return;
    frame = requestAnimationFrame(draw);
    if (!ctx || !mctx || !pctx || video.readyState < 2 || !video.videoWidth) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w) {
      canvas.width = mask.width = person.width = w;
      canvas.height = mask.height = person.height = h;
    }
    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    const mode = opts.background();

    // ---- Background ----
    let composed = false;
    if (vision && mode !== 'none') {
      try {
        const res = vision.seg.segmentForVideo(video, ts);
        const conf = res.confidenceMasks?.[0];
        if (conf) {
          const data = conf.getAsFloat32Array();
          const img = mctx.createImageData(conf.width, conf.height);
          for (let i = 0; i < data.length; i++) img.data[i * 4 + 3] = Math.round(clamp((data[i] - 0.25) / 0.5) * 255);
          if (mask.width !== conf.width) {
            mask.width = conf.width;
            mask.height = conf.height;
          }
          mctx.putImageData(img, 0, 0);
          res.close();
          // Person layer: video masked by the confidence mask (softened edges).
          pctx.globalCompositeOperation = 'copy';
          pctx.filter = 'blur(2px)';
          pctx.drawImage(mask, 0, 0, w, h);
          pctx.filter = 'none';
          pctx.globalCompositeOperation = 'source-in';
          pctx.drawImage(video, 0, 0, w, h);
          pctx.globalCompositeOperation = 'source-over';
          // Background layer.
          const bg = backgroundImage(mode);
          if (bg) {
            const s = Math.max(w / bg.naturalWidth, h / bg.naturalHeight);
            const bw = bg.naturalWidth * s;
            const bh = bg.naturalHeight * s;
            ctx.drawImage(bg, (w - bw) / 2, (h - bh) / 2, bw, bh);
          } else {
            ctx.filter = 'blur(14px)';
            ctx.drawImage(video, 0, 0, w, h);
            ctx.filter = 'none';
          }
          ctx.drawImage(person, 0, 0);
          composed = true;
        } else {
          res.close();
        }
      } catch {
        /* fall back to the plain picture */
      }
    }
    if (!composed) ctx.drawImage(video, 0, 0, w, h);

    // ---- Face cues, every other frame ----
    if (!vision || tick++ % 2) return;
    try {
      const r = vision.face.detectForVideo(video, ts);
      const cats = r.faceBlendshapes?.[0]?.categories;
      if (!cats?.length) {
        opts.onCues({ face: false, emotions: zeroEmotions(), dominant: 'neutral', eyeContact: 0, yaw: 0, pitch: 0, smile: 0, browFurrow: 0, blink: false });
        return;
      }
      const bs: Record<string, number> = {};
      for (const c of cats) bs[c.categoryName] = c.score;
      const { emotions, smile, browFurrow, look } = emotionsFromBlendshapes(bs);
      const m = r.facialTransformationMatrixes?.[0]?.data;
      const { yaw, pitch } = m ? headAngles(Array.from(m)) : { yaw: 0, pitch: 0 };
      const facing = clamp(1 - Math.max(Math.abs(yaw) - 8, 0) / 22) * clamp(1 - Math.max(Math.abs(pitch) - 10, 0) / 22);
      const eye = clamp(facing * (1 - clamp((look - 0.25) / 0.45)));
      const a = 0.35;
      for (const e of EMOTIONS) smooth.emotions[e] += a * (emotions[e] - smooth.emotions[e]);
      smooth.eye += a * (eye - smooth.eye);
      smooth.yaw += a * (yaw - smooth.yaw);
      smooth.pitch += a * (pitch - smooth.pitch);
      smooth.smile += a * (smile - smooth.smile);
      smooth.furrow += a * (browFurrow - smooth.furrow);
      const dominant = EMOTIONS.reduce((best, e) => (smooth.emotions[e] > smooth.emotions[best] ? e : best), 'neutral' as Emotion);
      opts.onCues({
        face: true,
        emotions: { ...smooth.emotions },
        dominant,
        eyeContact: smooth.eye,
        yaw: smooth.yaw,
        pitch: smooth.pitch,
        smile: smooth.smile,
        browFurrow: smooth.furrow,
        blink: (bs.eyeBlinkLeft + bs.eyeBlinkRight) / 2 > 0.55,
      });
    } catch {
      /* skip this frame */
    }
  };
  frame = requestAnimationFrame(draw);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}

/** Accumulates cues over one turn. */
export class CueAccumulator {
  private frames = 0;
  private faces = 0;
  private eye = 0;
  private smile = 0;
  private furrow = 0;
  private blinks = 0;
  private wasBlink = false;
  private started = performance.now();
  private emotions = zeroEmotions();

  add(c: FaceCues) {
    this.frames++;
    if (!c.face) return;
    this.faces++;
    this.eye += c.eyeContact;
    this.smile += c.smile;
    this.furrow += c.browFurrow;
    for (const e of EMOTIONS) this.emotions[e] += c.emotions[e];
    if (c.blink && !this.wasBlink) this.blinks++;
    this.wasBlink = c.blink;
  }

  summary(): CueSummary | null {
    if (!this.frames) return null;
    const n = Math.max(this.faces, 1);
    const emotions = Object.fromEntries(EMOTIONS.map((e) => [e, +(this.emotions[e] / n).toFixed(3)])) as Record<Emotion, number>;
    const dominant = EMOTIONS.reduce((best, e) => (emotions[e] > emotions[best] ? e : best), 'neutral' as Emotion);
    const minutes = Math.max((performance.now() - this.started) / 60000, 1 / 60);
    return {
      frames: this.frames,
      face_visible: +(this.faces / this.frames).toFixed(2),
      eye_contact: +(this.eye / n).toFixed(2),
      dominant,
      emotions,
      blinks_per_min: Math.round(this.blinks / minutes),
      smile: +(this.smile / n).toFixed(2),
      brow_furrow: +(this.furrow / n).toFixed(2),
    };
  }

  reset() {
    this.frames = this.faces = this.eye = this.smile = this.furrow = this.blinks = 0;
    this.wasBlink = false;
    this.started = performance.now();
    this.emotions = zeroEmotions();
  }
}
