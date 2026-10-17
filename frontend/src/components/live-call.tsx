'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, Eye, ScanFace, Smile, User } from 'lucide-react';
import { BACKGROUNDS, EMOTION_LABEL, EMOTIONS, startFaceVision, type BackgroundMode, type FaceCues } from '@/lib/face-vision';
import type { DeliveryFeedback } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge, Card } from './ui';

export interface SelfViewHandle {
  /** A JPEG data URL of the current (processed) camera frame, max 640 px wide, or null if the camera is off. */
  capture(): string | null;
}

type SelfViewProps = {
  className?: string;
  background: BackgroundMode;
  onCues?: (c: FaceCues) => void;
  onError?: (message: string) => void;
};

/**
 * The trainee's own camera, shown picture-in-picture on the 3D customer like a video call.
 * Background effects and expression cues run on-device (MediaPipe); a frame is only
 * captured on demand for the Gemini delivery check and never stored.
 */
export const SelfView = forwardRef<SelfViewHandle, SelfViewProps>(function SelfView({ className, background, onCues, onError }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const bgRef = useRef(background);
  bgRef.current = background;
  const cuesRef = useRef(onCues);
  cuesRef.current = onCues;
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopVision = () => {};
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setReady(true);
        stopVision = startFaceVision(video, canvas, {
          background: () => bgRef.current,
          onCues: (c) => cuesRef.current?.(c),
          onError: (m) => errRef.current?.(m),
        });
      } catch (err) {
        const name = (err as Error).name;
        errRef.current?.(name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings.' : 'No camera is available.');
      }
    })();
    return () => {
      cancelled = true;
      stopVision();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capture() {
      const src = canvasRef.current;
      if (!src || !ready || !src.width) return null;
      const scale = Math.min(1, 640 / src.width);
      const out = document.createElement('canvas');
      out.width = Math.round(src.width * scale);
      out.height = Math.round(src.height * scale);
      out.getContext('2d')?.drawImage(src, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.8);
    },
  }));

  return (
    <div className={cn('overflow-hidden rounded-lg bg-slate-900 shadow-lg ring-2 ring-white', className)}>
      {/* The raw video only feeds the canvas; the canvas shows the processed picture. */}
      <video ref={videoRef} muted playsInline aria-hidden className="pointer-events-none absolute h-px w-px opacity-0" />
      <canvas ref={canvasRef} aria-label="Your camera" role="img" className="h-full w-full -scale-x-100 object-cover" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
          <Camera className="h-5 w-5" aria-hidden />
        </div>
      )}
      <span className="absolute bottom-1 left-1.5 rounded bg-black/50 px-1.5 text-[10px] font-medium text-white">You</span>
    </div>
  );
});

/** Background effect picker and live, on-device expression read-out. */
export function CameraPanel({ background, onBackground, cues }: { background: BackgroundMode; onBackground: (m: BackgroundMode) => void; cues: FaceCues | null }) {
  const top = cues?.face ? [...EMOTIONS].sort((a, b) => cues.emotions[b] - cues.emotions[a]).slice(0, 4) : [];
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ScanFace className="h-4 w-4 text-slate-500" aria-hidden /> Camera and expression
      </h2>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Background">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={background === b.id}
            onClick={() => onBackground(b.id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors',
              background === b.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      {!cues ? (
        <p className="text-sm text-slate-500">Starting on-device expression detection…</p>
      ) : !cues.face ? (
        <p className="text-sm text-amber-800">No face in view. Sit centred, facing the camera, with light on your face.</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm" aria-live="off">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Expression now</span>
            <span className="font-semibold text-slate-900">{EMOTION_LABEL[cues.dominant]}</span>
          </div>
          {top.map((e) => (
            <div key={e} className="flex items-center gap-2">
              <span className="w-20 text-xs text-slate-600">{EMOTION_LABEL[e]}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${Math.round(cues.emotions[e] * 100)}%` }} />
              </span>
              <span className="w-8 text-right text-xs tabular-nums text-slate-500">{Math.round(cues.emotions[e] * 100)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <span className="w-20 text-xs text-slate-600">Eye contact</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className={cn('block h-full rounded-full transition-[width] duration-300', cues.eyeContact >= 0.6 ? 'bg-emerald-500' : cues.eyeContact >= 0.35 ? 'bg-amber-500' : 'bg-rose-500')}
                style={{ width: `${Math.round(cues.eyeContact * 100)}%` }}
              />
            </span>
            <span className="w-8 text-right text-xs tabular-nums text-slate-500">{Math.round(cues.eyeContact * 100)}</span>
          </div>
          <p className="text-xs text-slate-500">Runs in your browser with MediaPipe. Video is not uploaded.</p>
        </div>
      )}
    </Card>
  );
}

const EYE: Record<DeliveryFeedback['eye_contact'], { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  good: { label: 'Good eye contact', tone: 'good' },
  partial: { label: 'Some eye contact', tone: 'warn' },
  poor: { label: 'Little eye contact', tone: 'bad' },
  unclear: { label: 'Face not clear', tone: 'neutral' },
};

/** Gemini's read of the trainee's non-verbal delivery on the last turn. */
export function DeliveryCard({ feedback, pending, turnCues }: { feedback: DeliveryFeedback | null; pending: boolean; turnCues?: string | null }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <User className="h-4 w-4 text-slate-500" aria-hidden /> Your delivery on camera
      </h2>
      {!feedback ? (
        <p className="text-sm text-slate-500">
          {pending ? 'Gemini is looking at your last answer…' : 'Speak your answer: after each turn Gemini reviews one camera frame for eye contact, expression and posture.'}
        </p>
      ) : (
        <div className={cn('flex flex-col gap-2 text-sm text-slate-800', pending && 'opacity-60')} aria-live="polite">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={EYE[feedback.eye_contact].tone}>
              <Eye className="h-3.5 w-3.5" aria-hidden /> {EYE[feedback.eye_contact].label}
            </Badge>
            <Badge tone={feedback.fit === 'fits' ? 'good' : feedback.fit === 'mixed' ? 'warn' : 'bad'}>
              <Smile className="h-3.5 w-3.5" aria-hidden /> Expression {feedback.fit === 'fits' ? 'fits' : feedback.fit === 'mixed' ? 'mixed' : 'clashes'}
            </Badge>
          </div>
          <p>
            <span className="font-medium">Expression:</span> {feedback.expression}
          </p>
          <p>
            <span className="font-medium">Posture:</span> {feedback.posture}
          </p>
          <p className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 leading-relaxed">{feedback.tip}</p>
          {turnCues && <p className="text-xs text-slate-600">{turnCues}</p>}
          <p className="text-xs text-slate-500">One frame per turn, analysed by Gemini and not stored.</p>
        </div>
      )}
    </Card>
  );
}

/** Tracks whether the browser voice is speaking, for turn-taking in live mode. */
export function useSpeakingFlag(subscribe: (fn: (a: 'start' | 'word' | 'end') => void) => () => void) {
  const [speaking, setSpeaking] = useState(false);
  const cb = useCallback((a: 'start' | 'word' | 'end') => {
    if (a === 'start') setSpeaking(true);
    else if (a === 'end') setSpeaking(false);
  }, []);
  useEffect(() => subscribe(cb), [subscribe, cb]);
  return speaking;
}
