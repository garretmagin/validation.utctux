# UTCT UX Demo

Automated demo presentation for FHL and K2 showcases.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Self-contained HTML presentation (slides + iframe embed of ux.utct.dev) |
| `transcript.md` | Full narration script with timestamps |
| `transcript-ssml.xml` | SSML-formatted transcript for Azure TTS voice generation |
| `demo-automation.ts` | Playwright script that drives the demo with timed interactions |
| `generate-voice.py` | Script to generate voice-over audio (Azure TTS, or prints Clipchamp/MAI-Voice-1 instructions) |

## Quick Start

### 1. Preview the presentation
Open `index.html` in a browser. Use arrow keys or click nav dots to advance slides.

### 2. Record the demo

**Option A — Fully automated (Playwright)**:
```powershell
cd demo
npm install
npx playwright install chromium
npm run demo
```
Start your screen recorder (OBS, Teams, Snipping Tool) before running.

**Option B — Semi-automated (Playwright MCP)**:
Use Playwright MCP in your IDE to step through the demo interactively while recording.

**Option C — Manual with teleprompter**:
Open `index.html` full-screen, use `transcript.md` as your narration guide, advance slides manually.

### 3. Generate voice-over

**Azure TTS (automated)**:
```powershell
pip install azure-cognitiveservices-speech
$env:AZURE_SPEECH_KEY = "your-key"
$env:AZURE_SPEECH_REGION = "westus2"
python generate-voice.py
```

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

## Accessibility Checklist
- [x] Min 1920px display resolution
- [x] Large text (≥24px body, ≥48px headings)
- [x] High contrast dark theme
- [x] Voice narration describes all visuals
- [x] No "as you can see" / "read this slide" phrasing
- [x] No background music or flashing effects
- [x] Audio-only comprehension validated
