'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Flag,
  Gauge,
  HeartHandshake,
  Hourglass,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  RotateCcw,
  Send,
  ShieldAlert,
  Target,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { API_URL, MOCK, api, errorMessage } from '@/lib/api';
import type { CoachHint, ComplianceFlag, DeliveryFeedback, Persona, Scenario, Session, StateEventData, Turn } from '@/lib/types';
import { onSpeechActivity, speak, speechSynthesisSupported, stopSpeaking, unlockAudio, useSpeechRecognition } from '@/lib/speech';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Button, Card, CitationList, DifficultyDots, ErrorState, LinkButton, Meter, Skeleton } from '@/components/ui';
import { FlagList, HighlightedText, TurnBubble } from '@/components/transcript';
import { useToast } from '@/components/toast';
import { DemoGuide } from '@/components/demo-guide';
import { CustomerAvatar } from '@/components/customer-avatar';
import { CameraPanel, DeliveryCard, SelfView, useSpeakingFlag, type SelfViewHandle } from '@/components/live-call';
import { CueAccumulator, EMOTION_LABEL, type BackgroundMode, type CueSummary, type FaceCues } from '@/lib/face-vision';
import { avatarBackdrop, avatarModelUrl, customerVoice, moodFromMeters, videoAvatarBase } from '@/lib/avatar';
import { VideoAvatar } from '@/components/video-avatar';
import { GenerationProgress, REPORT_NOTE, REPORT_STAGES } from '@/components/generation-progress';

type StepKey = 'compliance' | 'customer' | 'grounding' | 'state' | 'coach';
interface TraceStep {
  key: StepKey;
  label: string;
  status: 'pending' | 'running' | 'done' | 'skipped';
  ms?: number;
}

const freshTrace = (): TraceStep[] => [
  { key: 'compliance', label: 'Compliance pre-check', status: 'running' },
  { key: 'customer', label: 'Customer reply (RAG-grounded)', status: 'pending' },
  { key: 'grounding', label: 'Grounding post-check', status: 'pending' },
  { key: 'state', label: 'Trust & patience update', status: 'pending' },
  { key: 'coach', label: 'Coach hint', status: 'pending' },
];

interface Meters extends StateEventData {
  key: number;
}

const PRECHECK_TIMEOUT_MS = 2500;

/**
 * Maps trace steps to keys in the `done` event's timing_ms. The server reports each step as the
 * offset (ms) from the start of the turn at which it finished, preferred over client timing.
 */
const SERVER_TIMING_KEY: Partial<Record<StepKey, string>> = {
  // The pre-check event arrives within milliseconds, so its client time is kept.
  customer: 'reply',
  grounding: 'compliance_post',
  state: 'state',
  coach: 'coach',
};

export function PracticeView({ sessionId, demo = false }: { sessionId: string; demo?: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [session, setSession] = useState<Session | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [meters, setMeters] = useState<Meters>({ trust: 40, patience: 70, key: 0 });
  const [hints, setHints] = useState<CoachHint[]>([]);
  const [trace, setTrace] = useState<TraceStep[] | null>(null);
  const [traceStats, setTraceStats] = useState<{ firstToken?: number; total?: number } | null>(null);
  const [status, setStatus] = useState<'active' | 'ended'>('active');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [guard, setGuard] = useState<{ text: string; flags: ComplianceFlag[] } | null>(null);
  const [turnError, setTurnError] = useState<{ detail: string; text: string } | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [voiceOut, setVoiceOut] = useState(true);
  const [canSpeak, setCanSpeak] = useState(false);
  const [ending, setEnding] = useState<'idle' | 'running' | 'failed'>('idle');
  const [endError, setEndError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [showDemo, setShowDemo] = useState(demo);
  // Live mode: camera on, hands-free voice turns, delivery feedback per turn.
  const [live, setLive] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryFeedback | null>(null);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const selfRef = useRef<SelfViewHandle>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const liveSubmitRef = useRef<(text: string) => void>(() => {});
  const [background, setBackground] = useState<BackgroundMode>('blur');
  const [cues, setCues] = useState<FaceCues | null>(null);
  const [turnCues, setTurnCues] = useState<CueSummary | null>(null);
  const cueAcc = useRef<CueAccumulator | null>(null);
  const lastCueUpdate = useRef(0);
  const onCues = useCallback((c: FaceCues) => {
    (cueAcc.current ??= new CueAccumulator()).add(c);
    const now = performance.now();
    if (now - lastCueUpdate.current > 200) {
      lastCueUpdate.current = now;
      setCues(c);
    }
  }, []);
  const customerSpeaking = useSpeakingFlag(onSpeechActivity);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const guardEditRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickToBottom = useRef(true);
  const voiceOutRef = useRef(voiceOut);
  voiceOutRef.current = voiceOut;
  // Natural Cloud TTS voice per customer; the mock build uses the browser voice.
  const cloudVoiceRef = useRef<string | undefined>(undefined);

  const locale = persona?.locale || 'en-US';
  cloudVoiceRef.current = persona && !MOCK ? customerVoice(persona) : undefined;
  const customerName = persona?.name ?? 'Customer';

  // ---------- Load ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getSession(sessionId);
        const [sc, p] = await Promise.all([api.getScenario(s.scenario_id), api.getPersona(s.persona_id)]);
        if (cancelled) return;
        setSession(s);
        setScenario(sc);
        setPersona(p);
        setTurns(s.turns);
        setStatus(s.status);
        setMeters({ trust: s.trust, patience: s.patience, key: 0 });
        setHints(s.turns.flatMap((t) => (t.coach ? [t.coach] : [])).reverse());
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      stopSpeaking();
    };
  }, [sessionId]);

  useEffect(() => setCanSpeak(speechSynthesisSupported()), []);

  // ---------- Auto-scroll ----------
  // Follow new content unless the user has scrolled up. Only an upward scroll unpins, so our own
  // (smooth) scrolling and late layout changes such as flags and citation chips never break the pin.
  const lastScrollTop = useRef(0);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) stickToBottom.current = true;
    else if (el.scrollTop < lastScrollTop.current - 4) stickToBottom.current = false;
    lastScrollTop.current = el.scrollTop;
  };
  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);
  useEffect(() => {
    scrollToBottom(streamText === null);
  }, [turns, streamText, guard, scrollToBottom]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => scrollToBottom(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [scrollToBottom, session, scenario, persona]);

  // ---------- Voice input ----------
  const draftBeforeSpeech = useRef('');
  const stt = useSpeechRecognition(locale, (text, final) => {
    const full = draftBeforeSpeech.current ? `${draftBeforeSpeech.current} ${text}` : text;
    setDraft(full);
    // Live mode: a finished utterance is sent straight away, like talking on a call.
    if (final && liveRef.current && full.trim()) liveSubmitRef.current(full);
  });
  const toggleMic = () => {
    if (stt.listening) stt.stop();
    else {
      stopSpeaking();
      setGuard(null);
      draftBeforeSpeech.current = draft.trim();
      stt.start();
    }
  };
  useEffect(() => {
    if (stt.error) toast('error', stt.error);
  }, [stt.error, toast]);

  // ---------- Trace helpers ----------
  /** Step times are offsets from the moment the message was sent, matching the server's timing_ms. */
  const markStep = (keys: StepKey[], status: TraceStep['status'], startedAt?: number) =>
    setTrace(
      (t) =>
        t?.map((s) => (keys.includes(s.key) ? { ...s, status, ms: startedAt ? Math.round(performance.now() - startedAt) : s.ms } : s)) ?? null,
    );

  // ---------- Stream one turn ----------
  const sendTurn = useCallback(
    async (clean: string) => {
      stt.stop();
      stopSpeaking();
      setBusy(true);
      setTurnError(null);
      setDraft('');
      stickToBottom.current = true;

      const traineeIndex = (turns.at(-1)?.index ?? -1) + 1;
      const traineeTurn: Turn = { index: traineeIndex, role: 'trainee', text: clean, at: new Date().toISOString(), citations: [], compliance: [] };
      setTurns((t) => [...t, traineeTurn]);
      setTrace(freshTrace());
      setTraceStats(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const turnStart = performance.now();
      let firstTokenMs: number | undefined;
      let finished = false;
      let streamed = '';
      let customerIndex: number | null = null;

      try {
        for await (const ev of api.sendTurn(sessionId, clean, controller.signal)) {
          switch (ev.event) {
            case 'compliance_pre': {
              const flags = ev.data.flags ?? [];
              setTurns((t) => t.map((x) => (x.index === traineeIndex && x.role === 'trainee' ? { ...x, compliance: flags } : x)));
              markStep(['compliance'], 'done', turnStart);
              markStep(['customer'], 'running');
              if (flags.length) setAnnounce(`Compliance alert: ${flags.map((f) => `${f.rule_id}, ${f.severity} risk. ${f.message}`).join(' ')}`);
              break;
            }
            case 'customer_delta':
              firstTokenMs ??= Math.round(performance.now() - turnStart);
              streamed += ev.data.text;
              setStreamText(streamed);
              break;
            case 'customer_done': {
              const turn = ev.data.turn;
              customerIndex = turn.index;
              setStreamText(null);
              setTurns((t) => [...t.filter((x) => !(x.role === 'customer' && x.index === turn.index)), turn]);
              markStep(['customer'], 'done', turnStart);
              // Post-check, meters and coach run concurrently; their events may arrive in any order.
              markStep(['grounding', 'state', 'coach'], 'running');
              setAnnounce(`${customerName} said: ${turn.text}`);
              if (voiceOutRef.current) speak(turn.text, locale, cloudVoiceRef.current, API_URL);
              break;
            }
            case 'compliance_post': {
              const flags = ev.data.flags ?? [];
              const target = customerIndex;
              if (flags.length && target != null) {
                setTurns((t) => t.map((x) => (x.role === 'customer' && x.index === target ? { ...x, compliance: [...x.compliance, ...flags] } : x)));
              }
              markStep(['grounding'], 'done', turnStart);
              break;
            }
            case 'state':
              setMeters((m) => ({ ...ev.data, key: m.key + 1 }));
              markStep(['state'], 'done', turnStart);
              break;
            case 'coach':
              setHints((h) => [ev.data.hint, ...h]);
              markStep(['coach'], 'done', turnStart);
              break;
            case 'done': {
              finished = true;
              setStatus(ev.data.session_status);
              const timing = ev.data.timing_ms;
              setTrace(
                (t) =>
                  t?.map((s) => {
                    const timingKey = SERVER_TIMING_KEY[s.key];
                    const serverMs = timingKey ? timing?.[timingKey] : undefined;
                    if (s.status === 'running' || s.status === 'pending') return { ...s, status: 'skipped' };
                    return serverMs != null ? { ...s, ms: serverMs } : s;
                  }) ?? null,
              );
              setTraceStats({
                firstToken: timing?.first_delta ?? firstTokenMs,
                total: timing?.total ?? Math.round(performance.now() - turnStart),
              });
              if (ev.data.session_status === 'ended') setAnnounce('The session has ended. Open your report to see the scores.');
              break;
            }
            case 'error':
              if (ev.data.status === 409) {
                setLocked(ev.data.detail || 'This session is no longer accepting messages.');
                setTurns((t) => t.filter((x) => !(x.index === traineeIndex && x.role === 'trainee')));
              } else {
                setTurnError({ detail: ev.data.detail, text: clean });
              }
              setTrace((t) => t?.map((s) => (s.status === 'running' || s.status === 'pending' ? { ...s, status: 'skipped' } : s)) ?? null);
              break;
          }
        }
      } catch (err) {
        setTurnError({ detail: errorMessage(err), text: clean });
      } finally {
        setStreamText(null);
        setBusy(false);
        abortRef.current = null;
        if (finished) {
          // Reconcile indices and stored flags with the server's copy.
          api
            .getSession(sessionId)
            .then((s) => {
              setTurns(s.turns);
              setStatus(s.status);
            })
            .catch(() => {});
        }
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [turns, sessionId, customerName, locale, stt],
  );

  /** Compliance Guard: precheck the message and hold it back on any high-severity flag. */
  const submit = async (text: string, force = false) => {
    const clean = text.trim();
    if (!clean || busy || checking || status === 'ended' || locked) return;
    if (!force) {
      setChecking(true);
      let flags: ComplianceFlag[] = [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PRECHECK_TIMEOUT_MS);
      try {
        flags = (await api.precheck(sessionId, clean, controller.signal)).flags ?? [];
      } catch {
        // Timeout or error: never block practice on the guard.
      } finally {
        clearTimeout(timer);
        setChecking(false);
      }
      if (flags.some((f) => f.severity === 'high')) {
        setGuard({ text: clean, flags });
        setAnnounce(`Compliance Guard held your message. ${flags.map((f) => `${f.rule_id}: ${f.message}`).join(' ')}`);
        requestAnimationFrame(() => guardEditRef.current?.focus());
        return;
      }
    }
    setGuard(null);
    void sendTurn(clean);
  };

  const editHeld = () => {
    setGuard(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const retry = () => {
    if (!turnError) return;
    const { text } = turnError;
    setTurns((t) => (t.at(-1)?.role === 'trainee' && t.at(-1)?.text === text ? t.slice(0, -1) : t));
    setTurnError(null);
    void sendTurn(text);
  };

  /** Live mode: grab one camera frame for delivery feedback, then send as usual. */
  const liveSubmit = (text: string) => {
    const frame = selfRef.current?.capture();
    if (frame && text.trim() && !busy && !checking && status === 'active') {
      const summary = cueAcc.current?.summary() ?? null;
      cueAcc.current?.reset();
      setTurnCues(summary);
      setDeliveryPending(true);
      api
        .delivery(sessionId, frame, text.trim(), summary)
        .then(setDelivery)
        .catch(() => {})
        .finally(() => setDeliveryPending(false));
    }
    void submit(text);
  };
  liveSubmitRef.current = liveSubmit;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (live) liveSubmit(draft);
    else void submit(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      unlockAudio();
      if (live) liveSubmit(draft);
      else void submit(draft);
    }
  };

  // Live mode turn-taking: listen whenever it is the trainee's turn and the customer is not speaking.
  const canListen = live && status === 'active' && !busy && !checking && !guard && !turnError && !customerSpeaking && ending === 'idle';
  useEffect(() => {
    if (!canListen || stt.listening || !stt.supported) return;
    const t = setTimeout(() => {
      draftBeforeSpeech.current = '';
      setDraft('');
      stt.start();
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canListen, stt.listening, stt.supported, stt.start]);

  const toggleLive = () => {
    unlockAudio();
    if (live) {
      stt.stop();
      setLive(false);
      return;
    }
    if (!stt.supported) toast('error', 'Voice input needs Chrome or Edge. You can still type your replies on camera.');
    setVoiceOut(true);
    setDelivery(null);
    setLive(true);
    // Like joining a call: the customer greets you with their opening line.
    const last = turns.at(-1);
    if (last?.role === 'customer' && traineeTurns === 0) speak(last.text, locale, cloudVoiceRef.current, API_URL);
  };

  // ---------- End session ----------
  const endSession = async () => {
    stt.stop();
    stopSpeaking();
    setEnding('running');
    setEndError(null);
    try {
      await api.endSession(sessionId);
      router.push(`/reports/${sessionId}`);
    } catch (err) {
      const code = (err as { status?: number }).status;
      if (code === 400) {
        setEnding('idle');
        toast('error', 'Reply to the customer at least once before ending the session.');
        return;
      }
      setEnding('failed');
      setEndError(errorMessage(err));
    }
  };

  const traineeTurns = useMemo(() => turns.filter((t) => t.role === 'trainee').length, [turns]);
  const canType = status === 'active' && !locked && ending === 'idle';

  // ---------- Render ----------
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        <LinkButton href="/scenarios" variant="ghost" className="mt-4" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
          Back to scenarios
        </LinkButton>
      </div>
    );
  }

  if (!session || !scenario || !persona) {
    return (
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_340px]" aria-busy="true">
        <span className="sr-only" role="status">
          Loading practice session...
        </span>
        <Skeleton className="h-[70vh]" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:py-6">
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announce}
      </div>

      {/* Header */}
      <Card className="mb-4 flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={persona.name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900">{scenario.title}</h1>
            <p className="truncate text-sm text-slate-600">
              with <span className="font-medium text-slate-800">{persona.name}</span>, {persona.title}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" className="tabular-nums">
            Turn {traineeTurns} / {scenario.max_turns}
          </Badge>
          {status === 'ended' ? (
            <Badge tone="neutral">Session ended</Badge>
          ) : (
            <Badge tone="good">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Live
            </Badge>
          )}
          {status === 'active' && (
            <button
              type="button"
              role="switch"
              aria-checked={live}
              onClick={toggleLive}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ring-1 ring-inset transition-colors',
                live ? 'bg-rose-600 text-white ring-rose-600 hover:bg-rose-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
              )}
            >
              {live ? <VideoOff className="h-4 w-4" aria-hidden /> : <Video className="h-4 w-4" aria-hidden />}
              {live ? 'End live call' : 'Live call (camera + voice)'}
            </button>
          )}
          {canSpeak && (
            <button
              type="button"
              role="switch"
              aria-checked={voiceOut}
              onClick={() => {
                if (voiceOut) stopSpeaking();
                setVoiceOut((v) => !v);
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ring-1 ring-inset transition-colors',
                voiceOut ? 'bg-brand-50 text-brand-800 ring-brand-200' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
              )}
            >
              {voiceOut ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
              Customer voice {voiceOut ? 'on' : 'off'}
            </button>
          )}
          <Button
            size="sm"
            variant={status === 'ended' ? 'primary' : 'secondary'}
            onClick={endSession}
            disabled={busy || checking || traineeTurns === 0}
            loading={ending === 'running'}
            icon={<Flag className="h-4 w-4" aria-hidden />}
          >
            {status === 'ended' ? 'View report' : 'End session'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_320px]">
        {/* Customer on a video-call stage */}
        <Card className="relative self-start overflow-hidden p-0 lg:sticky lg:top-20">
          {videoAvatarBase(persona) ? (
            <VideoAvatar
              base={videoAvatarBase(persona)!}
              name={persona.name}
              streaming={streamText !== null && !voiceOut}
              mood={moodFromMeters(meters.trust, meters.patience, meters.trust_delta)}
              className="h-[min(calc(100vh-12rem),720px)] min-h-[360px]"
            />
          ) : (
            <CustomerAvatar
              modelUrl={avatarModelUrl(persona)}
              backdrop={avatarBackdrop(persona)}
              name={persona.name}
              streaming={streamText !== null && !voiceOut}
              mood={moodFromMeters(meters.trust, meters.patience, meters.trust_delta)}
              className="h-[min(calc(100vh-12rem),720px)] min-h-[360px] rounded-none"
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
          <div className="absolute bottom-4 left-4 text-white drop-shadow">
            <div className="text-base font-semibold">{persona.name}</div>
            <div className="text-xs text-white/80">{persona.title}</div>
          </div>
          {live && (
            <>
              <SelfView
                ref={selfRef}
                background={background}
                onCues={onCues}
                className="absolute bottom-4 right-4 h-32 w-44"
                onError={(m) => toast('error', m)}
              />
              <span
                aria-live="polite"
                className={cn(
                  'absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white shadow',
                  stt.listening ? 'bg-rose-600' : customerSpeaking || busy ? 'bg-slate-800/80' : 'bg-slate-600/80',
                )}
              >
                {stt.listening ? <Mic className="h-3.5 w-3.5" aria-hidden /> : null}
                {stt.listening
                  ? 'Listening… speak now'
                  : customerSpeaking
                    ? `${persona.name} is speaking`
                    : busy || checking
                      ? `${persona.name} is thinking`
                      : guard
                        ? 'Message held by the Compliance Guard'
                        : 'Your turn'}
              </span>
            </>
          )}
        </Card>

        {/* Conversation */}
        <Card className="flex h-[calc(100vh-12rem)] min-h-[480px] flex-col overflow-hidden">
          <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <h2 className="sr-only">Conversation</h2>
            <ol ref={listRef} className="flex flex-col gap-5">
              {turns.map((t) => (
                <TurnBubble key={`${t.role}-${t.index}`} turn={t} customerName={customerName} />
              ))}
              {busy && streamText === null && turns.at(-1)?.role === 'trainee' && (
                <li className="flex items-center gap-3" aria-hidden>
                  <Avatar name={customerName} size="sm" />
                  <span className="flex gap-1 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                </li>
              )}
              {streamText !== null && (
                <li className="flex gap-3" aria-hidden>
                  <Avatar name={customerName} size="sm" />
                  <div className="flex max-w-[75%] flex-col items-start">
                    <div className="mb-1 text-xs font-medium text-slate-700">{customerName}</div>
                    <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-900">
                      {streamText}
                      <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-blink bg-slate-500" />
                    </div>
                  </div>
                </li>
              )}
            </ol>

            {turnError && (
              <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <span>Reply failed: {turnError.detail}</span>
                <Button size="sm" variant="secondary" onClick={retry} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                  Retry
                </Button>
              </div>
            )}
            {(status === 'ended' || locked) && (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
                <p className="text-sm text-slate-700">{locked ?? 'The conversation is over. Your evidence-based report is ready to generate.'}</p>
                <Button onClick={endSession} loading={ending === 'running'}>
                  See my report
                </Button>
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={onSubmit} className="border-t border-slate-200 bg-slate-50/60 p-3 sm:p-4">
            {guard && (
              <div
                role="alert"
                aria-labelledby="guard-title"
                onKeyDown={(e) => e.key === 'Escape' && editHeld()}
                className="mb-3 animate-fade-up rounded-xl border-2 border-rose-300 bg-rose-50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-700" aria-hidden />
                  <h2 id="guard-title" className="font-semibold text-rose-900">
                    Compliance Guard: message held back
                  </h2>
                </div>
                <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-800 ring-1 ring-inset ring-rose-200">
                  <HighlightedText text={guard.text} flags={guard.flags} />
                </p>
                <FlagList flags={guard.flags} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button ref={guardEditRef} size="sm" onClick={editHeld} icon={<Pencil className="h-4 w-4" aria-hidden />}>
                    Edit message
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void submit(guard.text, true)}>
                    Send anyway
                  </Button>
                  <span className="text-xs text-rose-900">Sending anyway is recorded as a violation in your report.</span>
                </div>
              </div>
            )}
            <label htmlFor="composer" className="sr-only">
              Your reply to {customerName}
            </label>
            <div
              className={cn(
                'flex items-end gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-inset ring-slate-300 focus-within:ring-2 focus-within:ring-brand-600',
                !canType && 'opacity-60',
              )}
            >
              <textarea
                id="composer"
                ref={inputRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (guard) setGuard(null);
                }}
                onKeyDown={onKeyDown}
                disabled={!canType}
                rows={2}
                autoFocus
                placeholder={canType ? `Reply to ${customerName}...` : 'This session is closed.'}
                aria-describedby="composer-help"
                className="max-h-40 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus-visible:outline-none"
              />
              {stt.supported && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={!canType || busy}
                  aria-pressed={stt.listening}
                  aria-label={stt.listening ? 'Stop dictation' : 'Dictate your reply'}
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50',
                    stt.listening ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {stt.listening ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
                </button>
              )}
              <Button
                type="submit"
                disabled={!canType || busy || checking || !draft.trim()}
                className="h-10 w-10 shrink-0 px-0"
                aria-label={checking ? 'Checking compliance' : 'Send reply'}
              >
                {busy || checking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
              </Button>
            </div>
            <p id="composer-help" className="mt-2 flex flex-wrap justify-between gap-2 px-1 text-xs text-slate-500">
              <span>
                <kbd className="rounded border border-slate-300 bg-white px-1 font-sans">Enter</kbd> to send,{' '}
                <kbd className="rounded border border-slate-300 bg-white px-1 font-sans">Shift</kbd>+
                <kbd className="rounded border border-slate-300 bg-white px-1 font-sans">Enter</kbd> for a new line
              </span>
              {checking && (
                <span className="flex items-center gap-1.5 font-medium text-slate-600" role="status">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Compliance Guard is checking...
                </span>
              )}
              {stt.listening && (
                <span className="flex items-center gap-1.5 font-medium text-rose-700" role="status">
                  <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-rose-600" /> Listening ({locale})
                </span>
              )}
            </p>
          </form>
        </Card>

        {/* Side panel */}
        <aside className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1" aria-label="Session insights">
          {live && <CameraPanel background={background} onBackground={setBackground} cues={cues} />}
          {live && (
            <DeliveryCard
              feedback={delivery}
              pending={deliveryPending}
              turnCues={turnCues ? `Last turn: eye contact ${Math.round(turnCues.eye_contact * 100)}%, mostly ${EMOTION_LABEL[turnCues.dominant].toLowerCase()}, face visible ${Math.round(turnCues.face_visible * 100)}% of the time.` : null}
            />
          )}
          {showDemo && (
            <DemoGuide
              traineeTurns={traineeTurns}
              ended={status === 'ended'}
              onUse={(line) => {
                setDraft(line);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              onDismiss={() => setShowDemo(false)}
            />
          )}
          <Card className="p-4">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Gauge className="h-4 w-4 text-slate-500" aria-hidden /> Customer state
            </h2>
            <div className="flex flex-col gap-4" title={meters.reason}>
              <Meter
                key={`t${meters.key}`}
                label="Trust"
                icon={<HeartHandshake className="h-4 w-4 text-slate-500" aria-hidden />}
                value={meters.trust}
                delta={meters.trust_delta}
                description={meters.reason}
              />
              <Meter
                key={`p${meters.key}`}
                label="Patience"
                icon={<Hourglass className="h-4 w-4 text-slate-500" aria-hidden />}
                value={meters.patience}
                delta={meters.patience_delta}
                description={meters.reason}
              />
            </div>
            {meters.reason && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-medium text-slate-800">Why: </span>
                {meters.reason}
              </p>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden /> Coach
            </h2>
            {hints.length === 0 ? (
              <p className="text-sm text-slate-500">Hints appear here after each reply. Start by acknowledging what the customer said.</p>
            ) : (
              <div aria-label="Coach hints, newest first" role="group">
                <div key={hints.length} className="animate-fade-up rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-900">
                  {hints[0].technique && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-900">{hints[0].technique}</div>}
                  <p className="leading-relaxed">{hints[0].hint}</p>
                  <CitationList citations={hints[0].citations} className="mt-2" />
                </div>
                {hints.length > 1 && (
                  <details className="group mt-2 text-sm">
                    <summary className="cursor-pointer rounded text-xs font-medium text-slate-600 hover:text-slate-900">Earlier hints ({hints.length - 1})</summary>
                    <ol className="mt-2 flex flex-col gap-2">
                      {hints.slice(1).map((h, i) => (
                        <li key={`${hints.length - 1 - i}`} className="rounded-lg bg-slate-50 p-3 text-slate-600">
                          {h.technique && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{h.technique}</div>}
                          <p className="leading-relaxed">{h.hint}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            )}
          </Card>

          {trace && (
            <Card className="p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Gemini pipeline, last turn</h2>
                <span className="text-xs text-slate-500">done at</span>
              </div>
              <ol className="flex flex-col gap-2 text-sm">
                {trace.map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    {s.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                    ) : s.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300" aria-hidden />
                    )}
                    <span className={cn('flex-1', s.status === 'pending' || s.status === 'skipped' ? 'text-slate-500' : 'text-slate-800')}>{s.label}</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {s.status === 'done' && s.ms != null ? `+${(s.ms / 1000).toFixed(1)}s` : s.status === 'skipped' ? 'skipped' : s.status === 'running' ? 'running' : ''}
                    </span>
                  </li>
                ))}
              </ol>
              {traceStats && (
                <dl className="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {traceStats.firstToken != null && (
                    <div className="flex gap-1">
                      <dt>First token</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{(traceStats.firstToken / 1000).toFixed(1)}s</dd>
                    </div>
                  )}
                  {traceStats.total != null && (
                    <div className="flex gap-1">
                      <dt>Total</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{(traceStats.total / 1000).toFixed(1)}s</dd>
                    </div>
                  )}
                </dl>
              )}
            </Card>
          )}

          <Card className="p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Target className="h-4 w-4 text-slate-500" aria-hidden /> Your goal
            </h2>
            <p className="text-sm text-slate-700">{scenario.trainee_goal}</p>
            <details className="group mt-3 text-sm">
              <summary className="cursor-pointer select-none rounded font-medium text-brand-700 hover:text-brand-800">Scenario brief</summary>
              <div className="mt-2 flex flex-col gap-3 text-slate-600">
                {scenario.context && <p>{scenario.context}</p>}
                {scenario.success_criteria.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Success looks like</div>
                    <ul className="list-disc space-y-1 pl-5">
                      {scenario.success_criteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  Difficulty <DifficultyDots value={scenario.difficulty} />
                </div>
              </div>
            </details>
          </Card>
        </aside>
      </div>

      {ending !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ending-title"
            aria-describedby={ending === 'running' ? undefined : 'ending-desc'}
            className={cn('w-full rounded-2xl bg-white shadow-lift', ending === 'running' ? 'max-w-md p-2' : 'max-w-sm p-6 text-center')}
          >
            {ending === 'running' ? (
              <GenerationProgress title="Scoring your conversation" titleId="ending-title" stages={REPORT_STAGES} stepMs={2200} note={REPORT_NOTE} className="border-0" />
            ) : (
              <>
                <h2 id="ending-title" className="font-semibold text-slate-900">
                  The report could not be generated
                </h2>
                <p id="ending-desc" className="mt-1 text-sm text-slate-600">
                  {endError}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="secondary" onClick={() => setEnding('idle')}>
                    Back to chat
                  </Button>
                  <Button onClick={endSession} autoFocus icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
                    Try again
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        <Link href="/scenarios" className="underline-offset-2 hover:underline">
          Leave practice
        </Link>{' '}
        &middot; The customer is played by AI and only states facts from your knowledge base.
      </p>
    </div>
  );
}
