'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, Eye, Smile, User } from 'lucide-react';
import type { DeliveryFeedback } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge, Card } from './ui';

export interface SelfViewHandle {
  /** A JPEG data URL of the current camera frame (max 640 px wide), or null if the camera is off. */
  capture(): string | null;
}

/**
 * The trainee's own camera, shown picture-in-picture on the 3D customer like a video call.
 * Frames are only captured on demand for delivery feedback and never stored.
 */
export const SelfView = forwardRef<SelfViewHandle, { className?: string; onError?: (message: string) => void }>(
  function SelfView({ className, onError }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      let stream: MediaStream | null = null;
      let cancelled = false;
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
            setReady(true);
          }
        } catch (err) {
          const name = (err as Error).name;
          onError?.(name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings.' : 'No camera is available.');
        }
      })();
      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      capture() {
        const v = videoRef.current;
        if (!v || !ready || !v.videoWidth) return null;
        const scale = Math.min(1, 640 / v.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.8);
      },
    }));

    return (
      <div className={cn('overflow-hidden rounded-lg bg-slate-900 shadow-lg ring-2 ring-white', className)}>
        <video ref={videoRef} muted playsInline aria-label="Your camera" className="h-full w-full -scale-x-100 object-cover" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300">
            <Camera className="h-5 w-5" aria-hidden />
          </div>
        )}
        <span className="absolute bottom-1 left-1.5 rounded bg-black/50 px-1.5 text-[10px] font-medium text-white">You</span>
      </div>
    );
  },
);

const EYE: Record<DeliveryFeedback['eye_contact'], { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  good: { label: 'Good eye contact', tone: 'good' },
  partial: { label: 'Some eye contact', tone: 'warn' },
  poor: { label: 'Little eye contact', tone: 'bad' },
  unclear: { label: 'Face not clear', tone: 'neutral' },
};

/** Gemini's read of the trainee's non-verbal delivery on the last turn. */
export function DeliveryCard({ feedback, pending }: { feedback: DeliveryFeedback | null; pending: boolean }) {
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
