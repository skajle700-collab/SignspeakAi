# SignSpeak

SignSpeak is a mobile-first browser prototype for practicing a small set of sign-language demo gestures. It uses the phone's front camera, the `@mediapipe/tasks-vision` 1.0.1 package with MediaPipe `HandLandmarker` and `FilesetResolver`, conservative landmark rules, and the browser's built-in SpeechSynthesis API to turn a stable accepted gesture into English text and optional speech.

## Run in Replit

From this artifact directory:

```bash
pnpm install
pnpm dev
```

The scaffold's Vite configuration supplies the required `PORT` and `BASE_PATH` values when launched by Replit. For a manual build, provide those environment variables as required by `vite.config.ts`.

## Camera permissions

SignSpeak does not request camera access on page load. Permission is requested only after the user taps **Start Translating**. Camera access requires HTTPS (or localhost), and **Stop Camera** releases every active media track. Video stays in the current browser session and is not recorded by this prototype.

## Supported prototype gestures

- HELLO
- YES
- NO
- THANK YOU
- HELP

The rules are intentionally conservative. A hand landmark candidate must remain the same across multiple frames before it becomes a translation, and a cooldown prevents repeated speech for a held gesture.

## Hand-recognition technology

When **Start Translating** is pressed, SignSpeak loads the MediaPipe Tasks Vision WebAssembly runtime from the pinned `@mediapipe/tasks-vision@1.0.1` distribution, downloads the official MediaPipe Hand Landmarker `.task` model into memory, verifies that the download is non-empty, and initializes the `HandLandmarker` before requesting the camera. The live loop then calls `detectForVideo` on the camera element for each animation frame. The model runs on-device; no camera frames are uploaded by this prototype. If GPU initialization is unavailable, the same downloaded model is retried with the CPU delegate.

If initialization fails, the app stops before recognition begins, shows the underlying technical error, and **Try again** creates a fresh landmarker initialization rather than starting a loop with a missing model.

## Current limitations

SignSpeak is a prototype that recognizes a limited number of supported gestures. Sign languages contain many signs, facial expressions, movements and regional variations. A complete sign-language translation system requires a properly trained machine-learning model and a large, representative dataset. The current rules are one-hand, demo-oriented shapes and are not a substitute for a qualified interpreter, accessibility service, or full sign-language understanding.

## Future trained model

`src/lib/sign-recognition.ts` is the recognition seam. Replace or extend `classifyLandmarks` with a trained classifier that accepts the same normalized landmark input and returns one of the `SupportedGesture` labels (or `null` for an uncertain result). Camera lifecycle, frame stability, cooldown, translation display, and speech controls can remain unchanged.