# ClipForge — Video Joiner and Converter for Windows

I just wanted to stitch a few phone clips together into one file without
opening a full video editor for it. This is that, plus a basic convert tab
for when the files aren't already in the same format. Electron app, FFmpeg
under the hood, drag-and-drop interface.

---

## Prerequisites

### 1. Node.js
Download and install from https://nodejs.org (LTS version)

### 2. FFmpeg
ClipForge uses FFmpeg to process videos. For packaged builds it bundles
`ffmpeg.exe`/`ffprobe.exe` from a `resources/` folder (not included in this
repo — the binaries are too large for git). Drop them in `resources/` before
running `npm run build`, or just have FFmpeg on your PATH for `npm start`.

**Easy install via Winget (Windows 10/11):**
```
winget install ffmpeg
```

**Or download manually:**
1. Go to https://ffmpeg.org/download.html → Windows builds
2. Extract the zip
3. Add the `bin` folder to your system PATH

To verify: open Command Prompt and run `ffmpeg -version`

---

## Running the App

```bash
# 1. Open a terminal in this folder, then:
npm install

# 2. Start the app:
npm start
```

---

## Building a Distributable (.exe)

```bash
npm run build
```

This creates an installer + portable `.exe` in the `dist/` folder.

---

## How to Use

1. **Add videos** — Drag & drop files onto the app, or click "Browse Files"
2. **Reorder** — Drag items in the list to set the join order
3. **Set output** — Click the folder bar at the bottom to choose where to save
4. **Join** — Hit the JOIN button. Done!

> **Note:** For best results, use videos with the same codec, resolution, and frame rate.  
> FFmpeg uses stream copy (no re-encoding) for fast joining. If videos have different formats,  
> you may need to re-encode — let us know and we can add a "safe mode" option.

---

## Supported Formats
MP4 · MOV · AVI · MKV · WEBM · FLV · WMV · M4V
