import {
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';

export const SUPPORTED_GESTURES = ['HELLO', 'YES', 'NO', 'THANK YOU', 'HELP'] as const;
export type SupportedGesture = (typeof SUPPORTED_GESTURES)[number];

export type Landmark = { x: number; y: number; z?: number };

export const GESTURE_TO_WORDS: Record<SupportedGesture, string> = {
  HELLO: 'hello',
  YES: 'yes',
  NO: 'no',
  'THANK YOU': 'thank you',
  HELP: 'help',
};

export const SENTENCE_WORD_LIMIT = 30;

export type HandLandmarkerInstance = Pick<
  HandLandmarker,
  'detectForVideo' | 'close'
>;

export const HAND_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null =
  null;

function loadFileset() {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(WASM_URL).catch((error) => {
      filesetPromise = null;
      throw new Error(
        `MediaPipe WebAssembly runtime failed to load from ${WASM_URL}. ${formatError(error)}`,
        { cause: error },
      );
    });
  }

  return filesetPromise;
}

async function downloadModel(): Promise<Uint8Array> {
  let response: Response;

  try {
    response = await fetch(HAND_LANDMARKER_MODEL_URL, {
      cache: 'force-cache',
      mode: 'cors',
    });
  } catch (error) {
    throw new Error(
      `Hand landmark model download failed from ${HAND_LANDMARKER_MODEL_URL}. ${formatError(error)}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Hand landmark model download returned HTTP ${response.status} ${response.statusText} from ${HAND_LANDMARKER_MODEL_URL}.`,
    );
  }

  const model = new Uint8Array(await response.arrayBuffer());
  if (model.byteLength < 1024) {
    throw new Error(
      `Hand landmark model download was incomplete (${model.byteLength} bytes).`,
    );
  }

  return model;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

export function getRecognitionErrorMessage(error: unknown): string {
  return formatError(error);
}

export function sentenceWordCount(gestures: SupportedGesture[]): number {
  return gestures.reduce((count, gesture) => {
    return count + GESTURE_TO_WORDS[gesture].trim().split(/\s+/).length;
  }, 0);
}

export function appendRecognizedGesture(
  gestures: SupportedGesture[],
  gesture: SupportedGesture,
): SupportedGesture[] {
  if (gestures.at(-1) === gesture) return gestures;

  const nextWordCount = sentenceWordCount(gestures) + sentenceWordCount([gesture]);
  if (nextWordCount > SENTENCE_WORD_LIMIT) return gestures;

  return [...gestures, gesture];
}

export function formatSentence(gestures: SupportedGesture[]): string {
  if (gestures.length === 0) return '';

  let sentence = gestures
    .map((gesture) => GESTURE_TO_WORDS[gesture])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (gestures[0] === 'HELLO' && gestures.length > 1) {
    sentence = sentence.replace(/^Hello\b/, 'Hello,');
  }

  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export async function createHandLandmarker(): Promise<HandLandmarkerInstance> {
  const [fileset, modelAssetBuffer] = await Promise.all([
    loadFileset(),
    downloadModel(),
  ]);

  const options = {
    baseOptions: {
      modelAssetBuffer,
      delegate: 'GPU' as const,
    },
    runningMode: 'VIDEO' as const,
    numHands: 1,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  };

  try {
    return await HandLandmarker.createFromOptions(fileset, options);
  } catch (gpuError) {
    console.warn(
      '[SignSpeak] GPU delegate unavailable; retrying hand landmarker with CPU.',
      gpuError,
    );
    try {
      return await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: {
          modelAssetBuffer,
          delegate: 'CPU',
        },
      });
    } catch (cpuError) {
      throw new Error(
        `MediaPipe HandLandmarker could not initialize with GPU or CPU. GPU: ${formatError(gpuError)} CPU: ${formatError(cpuError)}`,
        { cause: cpuError },
      );
    }
  }
}

const point = (landmarks: Landmark[], index: number) => landmarks[index];
const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function fingerExtended(landmarks: Landmark[], tip: number, pip: number, mcp: number) {
  const tipPoint = point(landmarks, tip);
  const pipPoint = point(landmarks, pip);
  const mcpPoint = point(landmarks, mcp);
  return tipPoint.y < pipPoint.y - 0.035 && pipPoint.y < mcpPoint.y + 0.01;
}

function thumbExtended(landmarks: Landmark[]) {
  const wrist = point(landmarks, 0);
  const thumbTip = point(landmarks, 4);
  const thumbMcp = point(landmarks, 2);
  const palmWidth = Math.max(distance(point(landmarks, 5), point(landmarks, 17)), 0.01);
  return distance(thumbTip, wrist) > distance(thumbMcp, wrist) + palmWidth * 0.18;
}

function palmOpen(landmarks: Landmark[]) {
  const palmWidth = distance(point(landmarks, 5), point(landmarks, 17));
  const spread = distance(point(landmarks, 8), point(landmarks, 20));
  return palmWidth > 0.04 && spread > palmWidth * 1.2;
}

/**
 * Deliberately conservative demo rules. A result is only a candidate; the
 * camera loop must observe the same candidate over several frames before UI
 * acceptance. This module is the intended seam for a future trained model.
 */
export function classifyLandmarks(landmarks: Landmark[]): SupportedGesture | null {
  if (landmarks.length < 21) return null;

  const index = fingerExtended(landmarks, 8, 6, 5);
  const middle = fingerExtended(landmarks, 12, 10, 9);
  const ring = fingerExtended(landmarks, 16, 14, 13);
  const pinky = fingerExtended(landmarks, 20, 18, 17);
  const thumb = thumbExtended(landmarks);
  const open = palmOpen(landmarks);
  const extended = [index, middle, ring, pinky].filter(Boolean).length;

  if (open && thumb && extended === 4) return 'HELLO';
  if (open && !thumb && extended === 4) return 'HELP';
  if (index && middle && !ring && !pinky && !thumb) return 'NO';
  if (thumb && !index && !middle && !ring && !pinky) return 'YES';
  if (index && middle && ring && !pinky && thumb) return 'THANK YOU';
  return null;
}