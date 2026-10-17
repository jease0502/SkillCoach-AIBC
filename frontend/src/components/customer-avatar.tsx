'use client';

import { useEffect, useRef, useState } from 'react';
import type { AvatarMood } from '@/lib/avatar';
import { onSpeechActivity } from '@/lib/speech';
import { cn } from '@/lib/utils';
import { Avatar } from './ui';

type Props = {
  modelUrl: string;
  name: string;
  /** True while the customer's reply text is streaming in (lip-sync without audio). */
  streaming: boolean;
  mood: AvatarMood;
  className?: string;
};

const MOODS: Exclude<AvatarMood, 'neutral'>[] = ['happy', 'relaxed', 'angry', 'sad', 'surprised'];
const VISEMES = ['aa', 'oh', 'ee', 'ih', 'ou'] as const;
// How strongly each mood shows on the face; strong moods are toned down so the face stays natural.
const MOOD_WEIGHT: Record<AvatarMood, number> = { neutral: 0, happy: 0.55, relaxed: 0.6, angry: 0.55, sad: 0.6, surprised: 0.5 };

/**
 * The practice customer as a 3D VRM avatar: idle breathing, blinking, eye contact,
 * lip-sync while the reply streams or is spoken, and a facial mood from the trust meter.
 * Falls back to the initials avatar when WebGL or the model is unavailable.
 */
export function CustomerAvatar({ modelUrl, name, streaming, mood, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef({ streaming, mood, speaking: false, kick: 0 });
  live.current.streaming = streaming;
  live.current.mood = mood;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(
    () =>
      onSpeechActivity((a) => {
        if (a === 'start') live.current.speaking = true;
        else if (a === 'end') live.current.speaking = false;
        else live.current.kick = performance.now();
      }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frame = 0;
    let cleanup = () => {};
    setState('loading');

    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
      if (disposed) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch (err) {
        console.warn('Avatar: WebGL unavailable', err);
        setState('failed');
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.className = 'block h-full w-full';
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(0.6, 1.8, 2.2);
      scene.add(key);

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      let gltf;
      try {
        gltf = await loader.loadAsync(modelUrl);
      } catch (err) {
        console.warn('Avatar: could not load', modelUrl, err);
        if (!disposed) setState('failed');
        ro.disconnect();
        renderer.dispose();
        renderer.domElement.remove();
        return;
      }
      if (disposed) return;
      const vrm = gltf.userData.vrm as import('@pixiv/three-vrm').VRM;
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse((o) => {
        o.frustumCulled = false;
      });
      scene.add(vrm.scene);

      const bone = (n: Parameters<typeof vrm.humanoid.getNormalizedBoneNode>[0]) => vrm.humanoid.getNormalizedBoneNode(n);
      // Arms down from the T-pose, elbows slightly bent.
      const lUpper = bone('leftUpperArm');
      const rUpper = bone('rightUpperArm');
      const lLower = bone('leftLowerArm');
      const rLower = bone('rightLowerArm');
      if (lUpper) lUpper.rotation.z = -1.22;
      if (rUpper) rUpper.rotation.z = 1.22;
      if (lLower) lLower.rotation.z = -0.12;
      if (rLower) rLower.rotation.z = 0.12;
      vrm.update(0);

      // Frame head and shoulders.
      const head = bone('head');
      const headPos = new THREE.Vector3();
      head?.getWorldPosition(headPos);
      const target = headPos.clone().add(new THREE.Vector3(0, 0.01, 0));
      camera.position.set(target.x, target.y + 0.03, target.z + 1.25);
      camera.lookAt(target);

      const gaze = new THREE.Object3D();
      scene.add(gaze);
      if (vrm.lookAt) vrm.lookAt.target = gaze;

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const spine = bone('spine');
      const chest = bone('chest') ?? bone('upperChest');
      const neck = bone('neck');
      const em = vrm.expressionManager;
      const moodLevel: Record<string, number> = Object.fromEntries(MOODS.map((m) => [m, 0]));
      let blinkAt = performance.now() + 1500;
      let mouth = 0;
      let viseme = 0;
      let nextSyllable = 0;
      const clock = new THREE.Clock();

      const tick = () => {
        frame = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.1);
        const t = clock.elapsedTime;
        const now = performance.now();
        const { streaming: isStreaming, speaking, mood: m, kick } = live.current;
        const talking = isStreaming || speaking;

        // Idle body motion.
        const sway = reduced ? 0.25 : 1;
        if (spine) spine.rotation.x = Math.sin(t * 1.4) * 0.012 * sway;
        if (chest) chest.rotation.x = Math.sin(t * 1.4 + 0.6) * 0.01 * sway;
        if (neck) {
          neck.rotation.y = Math.sin(t * 0.37) * 0.05 * sway;
          neck.rotation.x = Math.sin(t * 0.53) * 0.025 * sway + (talking ? Math.sin(t * 5.1) * 0.012 : 0);
        }
        gaze.position.set(camera.position.x + Math.sin(t * 0.31) * 0.08, camera.position.y + Math.sin(t * 0.23) * 0.04, camera.position.z);

        if (em) {
          // Blink every 2.5-6 s.
          const sinceBlink = now - blinkAt;
          let blink = 0;
          if (sinceBlink > 0) {
            blink = sinceBlink < 70 ? sinceBlink / 70 : sinceBlink < 160 ? 1 - (sinceBlink - 70) / 90 : 0;
            if (sinceBlink >= 160) blinkAt = now + 2500 + Math.random() * 3500;
          }
          em.setValue('blink', Math.max(0, blink));

          // Lip-sync: a new syllable every 90-180 ms while talking, or on each spoken word.
          if (talking && (now >= nextSyllable || now - kick < 16)) {
            viseme = Math.floor(Math.random() * VISEMES.length);
            nextSyllable = now + 90 + Math.random() * 90;
          }
          const syllable = talking ? 0.35 + 0.45 * Math.abs(Math.sin(((nextSyllable - now) / 180) * Math.PI)) : 0;
          mouth += (syllable - mouth) * Math.min(1, dt * 18);
          VISEMES.forEach((v, i) => em.setValue(v, i === viseme ? mouth : 0));

          // Mood eases in and out; mouth-heavy moods are softened while talking.
          for (const k of MOODS) {
            const goal = k === m ? MOOD_WEIGHT[m] * (talking ? 0.6 : 1) : 0;
            moodLevel[k] += (goal - moodLevel[k]) * Math.min(1, dt * 3);
            em.setValue(k, moodLevel[k]);
          }
        }
        vrm.update(dt);
        renderer.render(scene, camera);
      };
      tick();
      setState('ready');

      cleanup = () => {
        ro.disconnect();
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, [modelUrl]);

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-gradient-to-b from-slate-100 to-slate-200', className)}>
      <div ref={hostRef} className="absolute inset-0" role="img" aria-label={`3D avatar of ${name}, the practice customer`} />
      {state !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
          <Avatar name={name} size="lg" />
          {state === 'loading' ? 'Loading avatar…' : null}
        </div>
      )}
    </div>
  );
}
