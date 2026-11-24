# Demo AI Sales Voice - Frontend

Modern AI Sales & Customer Service Voice Assistant frontend built with **Svelte 5**, **Vite**, and **Tailwind CSS**.

Inspired by [bangarief-demoai.netlify.app](https://bangarief-demoai.netlify.app/).

## ✨ Features

- **Modern Glassmorphic UI**: Frosted glass effects, ambient light glow, soft gradient theme.
- **Interactive AI Voice Agent**:
  - Live Indonesian Speech Synthesis (`window.speechSynthesis`).
  - Web Speech API voice input (`SpeechRecognition`).
  - Animated multi-bar soundwave visualizer.
  - Real-time conversation transcript with timestamps and quick suggestion prompts.
  - Call controls: Start/End call, mute voice, mic toggle, session duration timer.
- **Backend Integration**: Communicates with the Rust backend (`demo-ai-sales-voice-backend`) via REST API proxy.

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://127.0.0.1:5173`.

## 📦 Production Build

```bash
npm run build
npm run preview
```
