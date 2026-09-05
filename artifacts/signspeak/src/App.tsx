import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Hand,
  Info,
  Lightbulb,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  classifyLandmarks,
  createHandLandmarker,
  appendRecognizedGesture,
  formatSentence,
  GESTURE_TO_WORDS,
  getRecognitionErrorMessage,
  SENTENCE_WORD_LIMIT,
  SUPPORTED_GESTURES,
  sentenceWordCount,
  type HandLandmarkerInstance,
  type SupportedGesture,
} from '@/lib/sign-recognition';

const queryClient = new QueryClient();

type CameraPhase = 'welcome' | 'loading-model' | 'requesting' | 'live' | 'error';
type CameraError = 'permission' | 'unavailable' | 'insecure' | 'model';
type SpeechStatus = 'idle' | 'speaking' | 'needs-tap' | 'unsupported';

const gestureDetails: Record<SupportedGesture, { hint: string; detail: string }> = {
  HELLO: { hint: 'Open palm, thumb out', detail: 'Show one open palm with all fingers comfortably spread.' },
  YES: { hint: 'Thumbs up', detail: 'Close your fingers into a relaxed fist and extend your thumb.' },
  NO: { hint: 'Index + middle', detail: 'Extend your index and middle fingers together; keep the others folded.' },
  'THANK YOU': { hint: 'Three fingers', detail: 'Extend your index, middle, and ring fingers with your thumb out.' },
  HELP: { hint: 'Open palm, thumb in', detail: 'Show an open palm with your thumb resting across your palm.' },
};

function Brand() {
  return (
    <div className="flex items-center gap-3" data-testid="brand-signspeak">
      <div className="brand-mark flex h-11 w-11 items-center justify-center rounded-2xl text-white">
        <Hand size={23} strokeWidth={2.1} aria-hidden="true" />
      </div>
      <div>
        <p className="font-display text-[17px] font-extrabold tracking-[-.035em] text-[#372052]">SignSpeak</p>
        <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#907fa3]">Sign Language Translator</p>
      </div>
    </div>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold ${
        live ? 'border-[#c5ebd9] bg-[#f0fbf5] text-[#26794f]' : 'border-[#e7def1] bg-white/70 text-[#7f6e91]'
      }`}
      data-testid="status-privacy"
    >
      {live ? <Waves size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
      {live ? 'Camera is on' : 'Private by design'}
    </div>
  );
}

function WelcomeArt() {
  return (
    <div className="relative mx-auto flex h-[190px] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[2rem] bg-[#f1eafa]">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[#e4d5fb]" />
      <div className="absolute -bottom-12 -left-6 h-36 w-36 rounded-full bg-[#f8dcae]/70" />
      <div className="absolute left-5 top-5 flex items-center gap-1 text-[#9a7bbc]">
        <Sparkles size={14} /><span className="text-[10px] font-bold uppercase tracking-[.12em]">a gentle start</span>
      </div>
      <div className="relative mt-4 rotate-[-7deg] text-[#6d4b9b]">
        <Hand size={104} strokeWidth={1.25} />
      </div>
      <div className="absolute bottom-5 right-5 rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-[10px] font-semibold text-[#6d587b] shadow-sm">
        No recordings saved
      </div>
    </div>
  );
}

function AboutPrototype() {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t border-[#eadff1] pt-5" data-testid="section-about-prototype">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between text-left"
        aria-expanded={open}
        data-testid="button-toggle-about"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-[#4e3765]">
          <Info size={16} className="text-[#8460ad]" aria-hidden="true" /> About this prototype
        </span>
        <ChevronDown className={`text-[#907fa3] transition-transform ${open ? 'rotate-180' : ''}`} size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="animate-rise-in pb-1 pr-2 text-[13px] leading-6 text-[#76657f]" data-testid="text-about-prototype">
          SignSpeak is a prototype that recognizes a limited number of supported gestures. Sign languages contain many signs, facial expressions, movements and regional variations. A complete sign-language translation system requires a properly trained machine-learning model and a large, representative dataset.
          <span className="mt-2 block">For this demo, a browser-compatible MediaPipe hand-landmark solution checks one hand in this session. Camera video is not recorded or sent anywhere by this prototype, and a translation is accepted only when landmarks remain stable across multiple frames.</span>
        </div>
      )}
    </section>
  );
}

function GestureGuide({
  selected,
  onSelect,
}: {
  selected: SupportedGesture;
  onSelect: (gesture: SupportedGesture) => void;
}) {
  return (
    <section className="strong-card rounded-[1.6rem] border border-[#e7dcef] bg-white p-5 sm:p-6" data-testid="section-supported-gestures">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[.16em] text-[#947da9]">Your small vocabulary</p>
          <h2 className="font-display text-xl font-extrabold tracking-[-.04em] text-[#3e2758]">Supported gestures</h2>
        </div>
        <div className="rounded-full bg-[#f4edf9] p-2 text-[#7952a4]"><Hand size={17} aria-hidden="true" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {SUPPORTED_GESTURES.map((gesture) => (
          <button
            key={gesture}
            type="button"
            onClick={() => onSelect(gesture)}
            className={`min-h-[62px] rounded-2xl border px-3 text-left transition-transform hover:-translate-y-0.5 ${
              selected === gesture ? 'border-[#9670c1] bg-[#f5effb] shadow-sm' : 'border-[#eee6f3] bg-[#fcfaff]'
            }`}
            data-testid={`button-gesture-${gesture.toLowerCase().replaceAll(' ', '-')}`}
          >
            <span className="block text-[12px] font-extrabold tracking-[.02em] text-[#51366c]">{gesture}</span>
            <span className="mt-1 block text-[11px] leading-4 text-[#927f9d]">{gestureDetails[gesture].hint}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#fff8e9] p-3.5 text-[12px] leading-5 text-[#775e39]" data-testid="text-selected-gesture-detail">
        <Lightbulb size={16} className="mt-0.5 shrink-0 text-[#d89624]" aria-hidden="true" />
        <span><strong>{selected}:</strong> {gestureDetails[selected].detail}</span>
      </div>
    </section>
  );
}

function ErrorCard({
  kind,
  technicalError,
  onRetry,
}: {
  kind: CameraError;
  technicalError: string | null;
  onRetry: () => void;
}) {
  const copy: Record<CameraError, { title: string; body: string }> = {
    permission: { title: 'Camera permission is needed', body: 'Allow camera access in your browser settings, then try again. SignSpeak never starts the camera without your tap.' },
    unavailable: { title: 'Camera unavailable here', body: 'This browser or device did not provide a camera. You can still explore the supported gesture guide.' },
    insecure: { title: 'A secure connection is needed', body: 'Camera access requires HTTPS or localhost. Open SignSpeak from a secure connection and try again.' },
    model: { title: 'Hand recognition could not be loaded', body: 'The hand model did not finish initializing, so recognition did not start. Your camera was not kept running while the model was unavailable.' },
  };
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center px-7 text-center" data-testid={`error-${kind}`}>
      <div className="mb-4 rounded-2xl bg-[#fff0ed] p-3 text-[#bd5d55]"><CircleAlert size={24} aria-hidden="true" /></div>
      <h2 className="font-display text-xl font-extrabold tracking-[-.03em] text-[#452c5e]">{copy[kind].title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#846f8e]">{copy[kind].body}</p>
      {kind === 'model' && technicalError && (
        <details className="mt-4 w-full max-w-sm rounded-2xl border border-[#eedfe1] bg-[#fff9f8] text-left">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-[#9b5752]">Technical error</summary>
          <code className="block max-h-32 overflow-auto border-t border-[#eedfe1] px-3 py-2 text-[11px] leading-5 text-[#874b49]">
            {technicalError}
          </code>
        </details>
      )}
      <button type="button" onClick={onRetry} className="mt-6 flex min-h-12 items-center gap-2 rounded-2xl bg-[#633b91] px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5" data-testid="button-retry-camera">
        <RotateCcw size={16} aria-hidden="true" /> Try Again
      </button>
    </div>
  );
}

function CameraStage({
  phase,
  videoRef,
  status,
  translation,
  sentence,
  sentenceWordCountValue,
  recognitionPaused,
  speechStatus,
  autoSpeak,
  technicalError,
  onStart,
  onStop,
  onSpeak,
  onSpeakSentence,
  onClearTranslation,
  onClearSentence,
  onToggleAutoSpeak,
  onToggleRecognition,
  error,
}: {
  phase: CameraPhase;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: string;
  translation: SupportedGesture | null;
  sentence: string;
  sentenceWordCountValue: number;
  recognitionPaused: boolean;
  speechStatus: SpeechStatus;
  autoSpeak: boolean;
  technicalError: string | null;
  onStart: () => void;
  onStop: () => void;
  onSpeak: () => void;
  onSpeakSentence: () => void;
  onClearTranslation: () => void;
  onClearSentence: () => void;
  onToggleAutoSpeak: () => void;
  onToggleRecognition: () => void;
  error: CameraError | null;
}) {
  const isLive = phase === 'live';
  return (
    <section className="strong-card overflow-hidden rounded-[1.6rem] border border-[#e7dcef] bg-white" data-testid="section-camera">
      <div className="flex items-center justify-between border-b border-[#eee5f3] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className={`h-2.5 w-2.5 rounded-full ${isLive ? 'animate-quiet-pulse bg-[#36a66d]' : 'bg-[#cbbbd4]'}`} />
          <span className="text-sm font-bold text-[#4d3563]">{isLive ? (recognitionPaused ? 'Recognition paused' : 'Listening for a sign') : 'Ready when you are'}</span>
        </div>
        {isLive && <span className="rounded-full bg-[#f5effb] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#75519a]">Live preview</span>}
      </div>
      <div className="camera-stage relative mx-4 mt-4 overflow-hidden rounded-[1.25rem]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={isLive ? 'aspect-[4/3] h-auto w-full object-cover' : 'hidden'}
          aria-label="Live camera preview"
          data-testid="video-camera-preview"
        />
        {isLive ? (
          <>
            <div className="camera-scan-line pointer-events-none absolute left-5 right-5 top-3 h-px bg-[#f4c77e]/80" />
            <div className="pointer-events-none absolute inset-4 rounded-xl border border-white/20" />
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-[#2a1e3d]/75 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur-sm" data-testid="status-detection">
              <Waves size={13} className="text-[#f4c77e]" aria-hidden="true" /> {status}
            </div>
          </>
        ) : error ? (
          <ErrorCard kind={error} technicalError={technicalError} onRetry={onStart} />
        ) : (
          <div className="relative flex min-h-[330px] flex-col items-center justify-center overflow-hidden px-7 text-center">
            <div className="absolute left-[-20%] top-[-35%] h-60 w-60 rounded-full bg-[#7652a2]/25 blur-2xl" />
            <div className="relative mb-5 rounded-[1.6rem] border border-white/15 bg-white/10 p-5 text-[#e7d9f8]">
              {phase === 'loading-model' || phase === 'requesting' ? <Waves size={38} className="animate-breathe" aria-hidden="true" /> : <Hand size={38} aria-hidden="true" />}
            </div>
            <p className="relative font-display text-xl font-extrabold tracking-[-.04em] text-white">
              {phase === 'loading-model' ? 'Loading hand recognition...' : phase === 'requesting' ? 'Asking for camera access' : 'Your camera stays off until you start'}
            </p>
            <p className="relative mt-2 max-w-xs text-sm leading-5 text-[#c6b7d6]">
              {phase === 'loading-model' ? 'Downloading the hand model and preparing on-device recognition. Nothing is recorded.' : phase === 'requesting' ? 'Just a moment. Nothing is recorded.' : 'When you are ready, we will look for one hand and nothing else.'}
            </p>
            {phase === 'welcome' && (
              <button type="button" onClick={onStart} className="relative mt-7 flex min-h-12 items-center gap-2 rounded-2xl bg-[#f4c77e] px-5 text-sm font-extrabold text-[#3e2852] shadow-lg shadow-[#120b1f]/20 transition-transform hover:-translate-y-0.5" data-testid="button-start-camera">
                <Play size={16} fill="currentColor" aria-hidden="true" /> Start Translating
              </button>
            )}
          </div>
        )}
      </div>
      <div className="px-4 pt-4 sm:px-5">
        <div className="rounded-2xl border border-[#dfd0e9] bg-[#f9f4fc] p-4 sm:p-5" data-testid="panel-current-sentence">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8f769f]">Current sentence</p>
              <p className="mt-1 text-xs font-semibold text-[#a18cae]">
                {sentenceWordCountValue}/{SENTENCE_WORD_LIMIT} recognized words
              </p>
            </div>
            <div className="rounded-xl bg-white p-2 text-[#7952a2] shadow-sm"><Waves size={17} aria-hidden="true" /></div>
          </div>
          <p
            className={`mt-4 min-h-[92px] rounded-xl border border-white/80 bg-white px-4 py-4 font-display text-xl font-extrabold leading-8 tracking-[-.035em] ${
              sentence ? 'text-[#42285c]' : 'text-[#b7a9bf]'
            }`}
            data-testid="text-current-sentence"
          >
            {sentence || 'Your recognized signs will build a sentence here.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onSpeakSentence}
              disabled={!sentence}
              className="touch-target flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#633b91] px-4 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#d8cce1]"
              data-testid="button-speak-sentence"
            >
              <Volume2 size={16} aria-hidden="true" /> {speechStatus === 'speaking' ? 'Speaking…' : 'Speak Sentence'}
            </button>
            <button
              type="button"
              onClick={onClearSentence}
              disabled={!sentence}
              className="touch-target flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ded1e8] bg-white px-4 text-xs font-bold text-[#6b4d7f] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="button-clear-sentence"
            >
              <Trash2 size={16} aria-hidden="true" /> Clear Sentence
            </button>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="rounded-2xl border border-[#ede4f2] bg-[#fcfaff] p-4" data-testid="panel-translation">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#9b88a8]">English translation</p>
              <p className="mt-1 font-display text-2xl font-extrabold tracking-[-.045em] text-[#42285c]" data-testid="text-translation">
                {translation || '—'}
              </p>
            </div>
            {translation ? <div className="rounded-full bg-[#e6f7ed] p-2 text-[#32855a]"><Check size={17} aria-hidden="true" /></div> : <CircleHelp size={20} className="text-[#c6b8cf]" aria-hidden="true" />}
          </div>
          {translation && speechStatus === 'needs-tap' && (
            <p className="mt-3 rounded-xl bg-[#fff8e9] px-3 py-2 text-xs font-semibold leading-5 text-[#856533]" data-testid="status-speech-prompt">
              It is ready to say aloud. Tap Speak Again if your browser needs a nudge.
            </p>
          )}
          {translation && speechStatus === 'unsupported' && (
            <p className="mt-3 rounded-xl bg-[#fff8e9] px-3 py-2 text-xs font-semibold leading-5 text-[#856533]" data-testid="status-speech-unsupported">
              Speech is not available in this browser. The translation is still shown above.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button type="button" onClick={onSpeak} disabled={!translation} className="touch-target flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#633b91] px-4 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#d8cce1]" data-testid="button-speak-again">
              <Volume2 size={16} aria-hidden="true" /> {speechStatus === 'speaking' ? 'Speaking…' : 'Speak Again'}
            </button>
            <button type="button" onClick={onClearTranslation} disabled={!translation} className="touch-target flex items-center justify-center gap-2 rounded-xl border border-[#ded1e8] bg-white px-4 text-xs font-bold text-[#6b4d7f] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-clear-translation">
              <X size={16} aria-hidden="true" /> Clear Translation
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={onToggleAutoSpeak} className="flex min-h-11 items-center gap-2 text-xs font-bold text-[#705784]" data-testid="button-toggle-auto-speak">
            <span className={`flex h-6 w-10 items-center rounded-full p-1 transition-colors ${autoSpeak ? 'justify-end bg-[#633b91]' : 'justify-start bg-[#d8cddd]'}`}>
              <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
            </span>
            Auto-speak accepted signs
          </button>
          {isLive && (
            <button
              type="button"
              onClick={onToggleRecognition}
              className="flex min-h-11 items-center gap-2 text-xs font-bold text-[#705784]"
              data-testid="button-toggle-recognition"
            >
              {recognitionPaused ? <Play size={14} fill="currentColor" aria-hidden="true" /> : <Pause size={14} fill="currentColor" aria-hidden="true" />}
              {recognitionPaused ? 'Resume Recognition' : 'Pause Recognition'}
            </button>
          )}
          {isLive && <button type="button" onClick={onStop} className="flex min-h-11 items-center gap-2 text-xs font-bold text-[#a34d5c]" data-testid="button-stop-camera"><Square size={14} fill="currentColor" aria-hidden="true" /> Stop Camera</button>}
        </div>
      </div>
    </section>
  );
}

function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarkerInstance | null>(null);
  const animationRef = useRef<number | null>(null);
  const autoSpeakRef = useRef(true);
  const recognitionPausedRef = useRef(false);
  const frameStateRef = useRef({ candidate: null as SupportedGesture | null, count: 0, lastAccepted: null as SupportedGesture | null, lastAcceptedAt: 0 });
  const [phase, setPhase] = useState<CameraPhase>('welcome');
  const [error, setError] = useState<CameraError | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [detectionStatus, setDetectionStatus] = useState('No supported sign detected');
  const [translation, setTranslation] = useState<SupportedGesture | null>(null);
  const [sentenceGestures, setSentenceGestures] = useState<SupportedGesture[]>([]);
  const [recognitionPaused, setRecognitionPaused] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('idle');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [selectedGesture, setSelectedGesture] = useState<SupportedGesture>('HELLO');
  autoSpeakRef.current = autoSpeak;
  recognitionPausedRef.current = recognitionPaused;
  const sentence = formatSentence(sentenceGestures);
  const currentSentenceWordCount = sentenceWordCount(sentenceGestures);

  const stopCamera = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    recognitionPausedRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    frameStateRef.current = { candidate: null, count: 0, lastAccepted: null, lastAcceptedAt: 0 };
    setDetectionStatus('No supported sign detected');
    setRecognitionPaused(false);
    setPhase('welcome');
  }, []);

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setSpeechStatus('unsupported');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.88;
      utterance.pitch = 1.02;
      utterance.onstart = () => setSpeechStatus('speaking');
      utterance.onend = () => setSpeechStatus('idle');
      utterance.onerror = () => setSpeechStatus('needs-tap');
      window.speechSynthesis.speak(utterance);
    } catch (speechError) {
      console.error('[SignSpeak] Speech synthesis failed', speechError);
      setSpeechStatus('needs-tap');
    }
  }, []);

  const speak = useCallback((gesture: SupportedGesture) => {
    speakText(GESTURE_TO_WORDS[gesture]);
  }, [speakText]);

  const speakSentence = useCallback(() => {
    if (sentence) speakText(sentence);
  }, [sentence, speakText]);

  const acceptGesture = useCallback((gesture: SupportedGesture) => {
    setTranslation(gesture);
    setSentenceGestures((current) => appendRecognizedGesture(current, gesture));
    setSpeechStatus('idle');
    if (autoSpeakRef.current) speak(gesture);
  }, [speak]);

  const processFrame = useCallback((time: number) => {
    if (recognitionPausedRef.current) {
      animationRef.current = null;
      return;
    }
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }
    try {
      const result = landmarker.detectForVideo(video, time);
      const landmarks = result.landmarks?.[0];
      const candidate = landmarks ? classifyLandmarks(landmarks) : null;
      const state = frameStateRef.current;
      if (!candidate) {
        state.candidate = null;
        state.count = 0;
        state.lastAccepted = null;
        state.lastAcceptedAt = 0;
        setDetectionStatus(landmarks ? 'Hand detected · Recognizing…' : 'Show your hand in front of the camera');
      } else if (state.candidate === candidate) {
        state.count += 1;
        const cooldownActive = state.lastAcceptedAt > 0 && time - state.lastAcceptedAt < 1200;
        setDetectionStatus(state.count >= 8 && !cooldownActive ? 'Sign accepted' : 'Recognizing…');
        if (state.count >= 8 && state.lastAccepted !== candidate && !cooldownActive) {
          state.lastAccepted = candidate;
          state.lastAcceptedAt = time;
          acceptGesture(candidate);
        }
      } else {
        state.candidate = candidate;
        state.count = 1;
        setDetectionStatus('Recognizing…');
      }
    } catch (detectionError) {
      console.error('[SignSpeak] Landmark detection failed', detectionError);
      setDetectionStatus('Recognition paused');
    }
    animationRef.current = requestAnimationFrame(processFrame);
  }, [acceptGesture]);

  const toggleRecognition = useCallback(() => {
    if (phase !== 'live') return;

    if (recognitionPausedRef.current) {
      recognitionPausedRef.current = false;
      setRecognitionPaused(false);
      setDetectionStatus('Show your hand in front of the camera');
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    recognitionPausedRef.current = true;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    frameStateRef.current.candidate = null;
    frameStateRef.current.count = 0;
    setRecognitionPaused(true);
    setDetectionStatus('Recognition paused');
  }, [phase, processFrame]);

  const startCamera = useCallback(async () => {
    setError(null);
    setTechnicalError(null);
    recognitionPausedRef.current = false;
    setRecognitionPaused(false);
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      console.error('[SignSpeak] Camera blocked: insecure context');
      setError('insecure');
      setPhase('error');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('[SignSpeak] Camera unavailable: getUserMedia missing');
      setError('unavailable');
      setPhase('error');
      return;
    }
    setPhase('loading-model');
    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }
    try {
      landmarkerRef.current = await createHandLandmarker();
    } catch (modelError) {
      console.error('[SignSpeak] Hand recognition model initialization failed', modelError);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setTechnicalError(getRecognitionErrorMessage(modelError));
      setError('model');
      setPhase('error');
      return;
    }

    setPhase('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Camera preview element is unavailable.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setPhase('live');
      animationRef.current = requestAnimationFrame(processFrame);
    } catch (cameraError) {
      console.error('[SignSpeak] Camera start failed', cameraError);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const name = cameraError instanceof DOMException ? cameraError.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') setError('permission');
      else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') setError('unavailable');
      else setError('unavailable');
      setPhase('error');
    }
  }, [processFrame]);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    landmarkerRef.current?.close?.();
    if (videoRef.current) videoRef.current.srcObject = null;
    window.speechSynthesis?.cancel();
  }, []);

  return (
    <div className="grain app-shell min-h-[100dvh]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
        <Brand />
        <StatusPill live={phase === 'live'} />
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 sm:pb-16">
        <div className="mb-8 max-w-2xl animate-rise-in pt-5 sm:mb-10 sm:pt-10">
          <p className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#8461a6]"><span className="h-1.5 w-1.5 rounded-full bg-[#efad43]" /> A calm camera practice tool</p>
          <h1 className="font-display text-[clamp(2.45rem,8vw,5rem)] font-extrabold leading-[.98] tracking-[-.075em] text-[#3b2455]">
            Find your words,<br /><span className="text-[#7952a2]">one sign at a time.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#735f80] sm:text-base">
            SignSpeak watches for a small set of supported gestures, then gives them an English voice. No recording. No rush. Just a little practice with your camera.
          </p>
        </div>
        <div className="desktop-grid grid gap-6 lg:gap-8">
          <div className="order-1">
            <CameraStage
              phase={phase}
              videoRef={videoRef}
              status={detectionStatus}
              translation={translation}
              sentence={sentence}
              sentenceWordCountValue={currentSentenceWordCount}
              recognitionPaused={recognitionPaused}
              speechStatus={speechStatus}
              autoSpeak={autoSpeak}
              technicalError={technicalError}
              onStart={startCamera}
              onStop={stopCamera}
              onSpeak={() => translation && speak(translation)}
              onSpeakSentence={speakSentence}
              onClearTranslation={() => { setTranslation(null); setSpeechStatus('idle'); }}
              onClearSentence={() => {
                window.speechSynthesis?.cancel();
                setSentenceGestures([]);
                setSpeechStatus('idle');
              }}
              onToggleAutoSpeak={() => setAutoSpeak((value) => !value)}
              onToggleRecognition={toggleRecognition}
              error={error}
            />
          </div>
          <div className="order-2 space-y-6">
            <div className="soft-card rounded-[1.6rem] border border-[#eadff1] bg-[#fffdfd] p-5 sm:p-6">
              <WelcomeArt />
              <div className="mt-5 flex items-start gap-3">
                <div className="rounded-xl bg-[#f4edf9] p-2 text-[#7952a2]"><LockKeyhole size={17} aria-hidden="true" /></div>
                <div>
                  <h2 className="font-display text-base font-extrabold text-[#4a3061]">A private place to practice</h2>
                  <p className="mt-1 text-[13px] leading-5 text-[#85718f]">Your camera starts only after you choose Start camera. The preview stays in this browser session.</p>
                </div>
              </div>
              <AboutPrototype />
            </div>
            <GestureGuide selected={selectedGesture} onSelect={setSelectedGesture} />
          </div>
        </div>
        <footer className="mt-10 flex flex-col gap-3 border-t border-[#e9deef] pt-5 text-xs leading-5 text-[#947f9e] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2"><Mic size={14} aria-hidden="true" /> Built for a moment of patient practice.</p>
          <p className="flex items-center gap-1.5"><ShieldCheck size={14} aria-hidden="true" /> Nothing is recorded by this prototype.</p>
        </footer>
      </main>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={() => <div className="p-10 text-center">Page not found</div>} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;