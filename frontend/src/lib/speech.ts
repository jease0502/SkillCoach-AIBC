'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings for the Web Speech API (not in lib.dom for all browsers).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech-to-text. `onText` receives the full transcript of the current utterance
 * (interim results included) so the composer can show words as they are recognised.
 */
export function useSpeechRecognition(lang: string, onText: (text: string, final: boolean) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => setSupported(getRecognitionCtor() !== null), []);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    recRef.current?.abort();
    const rec = new Ctor();
    rec.lang = lang || 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onTextRef.current((finalText + interim).trim(), interim === '');
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'no-speech' || e.error === 'aborted') return; // nothing heard, or stopped on purpose
      setError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in your browser settings.' : `Speech recognition error: ${e.error}`);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }, [lang]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, error, start, stop };
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Speech activity for the 3D avatar's lip-sync. */
export type SpeechActivity = 'start' | 'word' | 'end';
const speechListeners = new Set<(a: SpeechActivity) => void>();
const emitSpeech = (a: SpeechActivity) => speechListeners.forEach((fn) => fn(a));

export function onSpeechActivity(fn: (a: SpeechActivity) => void): () => void {
  speechListeners.add(fn);
  return () => {
    speechListeners.delete(fn);
  };
}

// One shared <audio> element. Safari and iOS only let a page play audio that a click or key
// press started, so the first gesture "unlocks" this element and every reply reuses it.
let sharedAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let speakToken = 0;
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function audioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    // 'playing' fires when sound actually starts (after buffering), so the talking video lines up.
    sharedAudio.addEventListener('playing', () => emitSpeech('start'));
    const done = () => emitSpeech('end');
    sharedAudio.addEventListener('ended', done);
    sharedAudio.addEventListener('pause', done);
    sharedAudio.addEventListener('error', done);
  }
  return sharedAudio;
}

/** Call from a click or key handler so later replies may play on Safari / iOS. */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  const a = audioElement();
  if (a.dataset.unlocked) return;
  a.dataset.unlocked = '1';
  a.src = SILENCE;
  a.play().then(() => a.pause()).catch(() => {});
}

/**
 * Speak the customer's reply. With a Cloud voice (Chirp 3 HD, via the API's /api/tts) when
 * `cloudVoice` is given; falls back to the browser voice if that fails.
 */
export function speak(text: string, lang = 'en-US', cloudVoice?: string, apiUrl?: string) {
  stopSpeaking();
  const token = ++speakToken;
  if (cloudVoice && apiUrl && typeof window !== 'undefined') {
    fetch(`${apiUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1200), voice: cloudVoice, language: lang.startsWith('en-') ? lang : 'en-US' }),
    })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (token !== speakToken) return;
        const a = audioElement();
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = URL.createObjectURL(blob);
        a.src = currentUrl;
        return a.play();
      })
      .catch(() => {
        if (token === speakToken) browserSpeak(text, lang);
      });
    return;
  }
  browserSpeak(text, lang);
}

function browserSpeak(text: string, lang: string) {
  if (!speechSynthesisSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  const voice = synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith(lang.split('-')[0]));
  if (voice) utter.voice = voice;
  utter.rate = 1.02;
  utter.onstart = () => emitSpeech('start');
  utter.onboundary = (e) => {
    if (e.name === 'word') emitSpeech('word');
  };
  utter.onend = () => emitSpeech('end');
  utter.onerror = () => emitSpeech('end');
  synth.speak(utter);
}

export function stopSpeaking() {
  speakToken++;
  if (sharedAudio && !sharedAudio.paused) sharedAudio.pause();
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
  emitSpeech('end');
}
