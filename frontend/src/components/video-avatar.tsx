'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarMood } from '@/lib/avatar';
import { onSpeechActivity } from '@/lib/speech';
import { cn } from '@/lib/utils';

type Clip = 'listen' | 'talk' | 'upset';
const CLIPS: Clip[] = ['listen', 'talk', 'upset'];

type Props = {
  /** Base URL of the clip set: `${base}-listen.mp4`, `-talk.mp4`, `-upset.mp4`, `.jpg` poster. */
  base: string;
  name: string;
  /** True while the reply text streams in without the browser voice. */
  streaming: boolean;
  mood: AvatarMood;
  className?: string;
};

/**
 * The practice customer as a photorealistic person on a video call: three looping
 * clips (listening, talking, unhappy) made with Veo from a generated portrait, cross-faded
 * by the conversation state. Every clip starts and ends on the same frame, so loops and
 * switches are seamless.
 */
export function VideoAvatar({ base, name, streaming, mood, className }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const refs = useRef<Record<Clip, HTMLVideoElement | null>>({ listen: null, talk: null, upset: null });

  useEffect(
    () =>
      onSpeechActivity((a) => {
        if (a === 'start') setSpeaking(true);
        else if (a === 'end') setSpeaking(false);
      }),
    [],
  );

  const active: Clip = speaking || streaming ? 'talk' : mood === 'angry' || mood === 'sad' ? 'upset' : 'listen';

  // Restart the talking clip from its first frame when the customer starts to speak.
  useEffect(() => {
    const v = refs.current[active];
    if (!v) return;
    if (active === 'talk') v.currentTime = 0;
    void v.play().catch(() => {});
  }, [active]);

  return (
    <div className={cn('relative overflow-hidden bg-slate-200', className)} role="img" aria-label={`${name}, the practice customer, on a video call`}>
      {CLIPS.map((c) => (
        <video
          key={c}
          ref={(el) => {
            refs.current[c] = el;
          }}
          src={`${base}-${c}.mp4`}
          poster={`${base}.jpg`}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          aria-hidden
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            c === active ? 'opacity-100' : 'opacity-0',
          )}
          style={{ objectPosition: '50% 30%' }}
        />
      ))}
    </div>
  );
}
