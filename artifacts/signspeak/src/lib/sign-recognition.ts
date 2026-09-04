export const SUPPORTED_GESTURES = ['HELLO', 'YES', 'NO', 'THANK YOU', 'HELP'] as const;
export type SupportedGesture = (typeof SUPPORTED_GESTURES)[number];

export type Landmark = { x: number; y: number; z?: number };

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (wasmPath: string) => Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions: (fileset: unknown, options: Record<string, unknown>) => Promise<HandLandmarkerInstance>;
  };
};

export type HandLandmarkerInstance = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks?: Landmark[][] };
  close?: () => void;
};

declare global {
  interface Window {
    __signSpeakVision?: VisionModule;
  }
}

const VISION_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let visionPromise: Promise<VisionModule> | null = null;

/**
 * Loads the browser ESM build rather than shipping a large WASM bundle in the
 * prototype. Keeping this boundary small means a trained classifier can be
 * swapped in later without changing the camera or UI layer.
 */
export function loadVisionModule(): Promise<VisionModule> {
  if (window.__signSpeakVision) return Promise.resolve(window.__signSpeakVision);
  if (visionPromise) return visionPromise;

  visionPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { FilesetResolver, HandLandmarker } from "${VISION_URL}";
      window.__signSpeakVision = { FilesetResolver, HandLandmarker };
      window.dispatchEvent(new Event('signspeak-vision-ready'));
    `;
    const timeout = window.setTimeout(() => {
      reject(new Error('The hand landmark model loader timed out.'));
    }, 18000);
    const complete = () => {
      window.clearTimeout(timeout);
      if (window.__signSpeakVision) resolve(window.__signSpeakVision);
      else reject(new Error('The hand landmark library did not initialize.'));
    };
    window.addEventListener('signspeak-vision-ready', complete, { once: true });
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('The hand landmark library could not be downloaded.'));
    };
    document.head.appendChild(script);
  });

  return visionPromise;
}

export async function createHandLandmarker(): Promise<HandLandmarkerInstance> {
  const vision = await loadVisionModule();
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.72,
    minHandPresenceConfidence: 0.72,
    minTrackingConfidence: 0.72,
  };
  try {
    return await vision.HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    });
  } catch (gpuError) {
    console.warn('[SignSpeak] GPU delegate unavailable; retrying with CPU', gpuError);
    return vision.HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    });
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