# UTCT UX Demo

Automated demo presentation for FHL and K2 showcases.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Self-contained HTML presentation (4 slides: Title, Problem, AI Story, Case Study, Live Demo transition) |
| `transcript.md` | Full narration script (~2 min) with timestamps |
| `transcript-ssml.xml` | SSML-formatted transcript for Azure TTS voice generation |
| `demo-automation.ts` | Playwright script that drives the demo with timed interactions and video recording |
| `generate-voice.mjs` | Node.js script to generate voice-over audio via Azure Speech REST API (credentials from Key Vault) |
| `playwright.config.ts` | Playwright configuration (test match, timeout) |

## Quick Start

### 1. Preview the presentation
Open `index.html` in a browser. Use arrow keys or click nav dots to advance slides.

### 2. Record the demo

**Option A — Fully automated (Playwright)**:
```powershell
cd demo
npm install
npm run demo
```
Close Edge before running (Playwright uses your existing Edge profile so auth is already active). Video is recorded automatically to `test-results/` at 1920×1080.

**Option B — Semi-automated (Playwright MCP)**:
Use Playwright MCP in your IDE to step through the demo interactively while recording.

**Option C — Manual with teleprompter**:
Open `index.html` full-screen, use `transcript.md` as your narration guide, advance slides manually.

### 3. Generate voice-over

**Azure TTS (automated)**:
```powershell
cd demo
npm install
az login
npm run generate-voice
```
Credentials are read automatically from Azure Key Vault `garretm-dev` (secrets: `speech-key`, `speech-region`). Falls back to `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` env vars.

Output defaults to `narration.wav` (48kHz 16-bit uncompressed). Use `--output narration.mp3` for compressed output.

**Change the voice:**
```powershell
npm run generate-voice -- --voice en-US-BrianNeural
```
Remember to also update the `<voice name="...">` tag in `transcript-ssml.xml` to match.

Current voice: `en-GB-OllieMultilingualNeural` at 30% speed increase.

**Clipchamp (manual, free)**:
1. Open [clipchamp.com](https://clipchamp.com)
2. Import your screen recording
3. Record & Create → Text to Speech → paste from `transcript.md`
4. Export with voice-over

**MAI-Voice-1 (experimental)**:
1. Open [Copilot Labs](https://copilot.microsoft.com/labs)
2. Use Audio Expressions → paste transcript → download MP3

### 4. Compose final video
Import screen recording + narration audio into Clipchamp or your editor of choice. Align audio to video, export at 1920×1080.

## Slide Overview

| # | Slide | Duration |
|---|-------|----------|
| 0 | Title — "UTCT UX" | ~9s |
| 1 | The Problem — 3 challenge cards (No Visualization, Wrong Question, Finding the Right Targets) | ~30s |
| 2 | AI-Accelerated Development — timeline (Prototype → Demand & Deploy → Enhanced) | ~27s |
| 3 | First Discovery — 24-hour testpass case study (before/after device pool fix) | ~18s |
| — | Live Demo transition → opens ux.utct.dev in new tab | ~6s |
| — | Live demo walkthrough (build selection, Gantt chart, dependency deep dive) | ~50s |

## Azure Resources

| Resource | Location | Purpose |
|----------|----------|---------|
| `garretm-speech` (Cognitive Services) | westus2 | Azure Speech TTS for voice generation |
| `garretm-dev` (Key Vault) | westus2 | Stores `speech-key` and `speech-region` secrets |

## Accessibility Checklist
- [x] Min 1920px display resolution
- [x] Large text (≥24px body, ≥48px headings)
- [x] High contrast light theme
- [x] Voice narration describes all visuals
- [x] No "as you can see" / "read this slide" phrasing
- [x] No background music or flashing effects
- [x] Audio-only comprehension validated
