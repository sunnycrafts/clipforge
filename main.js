const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const ffmpegPath = app.isPackaged
  ? path.join(process.resourcesPath, 'ffmpeg.exe')
  : path.join(__dirname, 'resources', 'ffmpeg.exe');

const ffprobePath = app.isPackaged
  ? path.join(process.resourcesPath, 'ffprobe.exe')
  : path.join(__dirname, 'resources', 'ffprobe.exe');

let mainWindow;

// Hardware encoders detected at startup: { libx264: 'h264_nvenc', libx265: 'hevc_qsv', ... }
let hwEncoders = {};
function detectHwEncoders() {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-encoders'], { timeout: 10000 }, (err, stdout) => {
      const result = {};
      if (!err && stdout) {
        const avail = new Set();
        for (const line of stdout.split('\n')) {
          const m = line.match(/^\s*V[\w.]*\s+(\S+)/);
          if (m) avail.add(m[1]);
        }
        const prefs = [
          ['libx264', ['h264_nvenc', 'h264_qsv', 'h264_amf']],
          ['libx265', ['hevc_nvenc', 'hevc_qsv', 'hevc_amf']],
        ];
        for (const [base, cands] of prefs) {
          for (const c of cands) { if (avail.has(c)) { result[base] = c; break; } }
        }
      }
      hwEncoders = result;
      resolve(result);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 740, minWidth: 700, minHeight: 520,
    frame: false, backgroundColor: '#f3f3f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => { createWindow(); detectHwEncoders(); });

ipcMain.handle('get-app-info', () => {
  let changelog = '';
  try { changelog = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8'); } catch (_) {}
  return { version: app.getVersion(), changelog };
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.handle('pick-output', async (_, defaultPath) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Joined Video',
    defaultPath: defaultPath || path.join(os.homedir(), 'Videos', 'joined_output.mp4'),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return r.filePath || null;
});

ipcMain.handle('pick-cut-output', async (_, suggestedPath) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Trimmed Video',
    defaultPath: suggestedPath || path.join(os.homedir(), 'Videos', 'trimmed_output.mp4'),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return r.filePath || null;
});

ipcMain.handle('pick-output-folder', async (_, defaultPath) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Output Folder', properties: ['openDirectory'],
    defaultPath: defaultPath || undefined,
  });
  return (r.filePaths && r.filePaths[0]) || null;
});

ipcMain.handle('open-files', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Videos', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video Files', extensions: ['mp4','mov','avi','mkv','webm','flv','wmv','m4v','ts','mts','m2ts'] }],
  });
  return r.filePaths || [];
});

ipcMain.handle('open-media', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Media Files', properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Media', extensions: ['mp4','mov','avi','mkv','webm','flv','wmv','m4v','ts','mts','m2ts','mp3','aac','flac','wav','ogg','m4a','opus'] },
      { name: 'Video', extensions: ['mp4','mov','avi','mkv','webm','flv','wmv','m4v','ts','mts','m2ts'] },
      { name: 'Audio', extensions: ['mp3','aac','flac','wav','ogg','m4a','opus'] },
    ],
  });
  return r.filePaths || [];
});

ipcMain.handle('open-folders', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Folders', properties: ['openDirectory', 'multiSelections'],
  });
  return r.filePaths || [];
});

const VIDEO_EXTS = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|ts|mts|m2ts)$/i;

const MEDIA_EXTS = /\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v|mp3|aac|flac|wav|ogg|m4a|opus|ts|mts|m2ts)$/i;

function scanFolderRecursive(folderPath, extRe = VIDEO_EXTS) {
  let results = [];
  let entries;
  try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); } catch (_) { return results; }
  for (const entry of entries) {
    const full = path.join(folderPath, entry.name);
    if (entry.isDirectory()) results = results.concat(scanFolderRecursive(full, extRe));
    else if (extRe.test(entry.name)) results.push(full);
  }
  return results;
}

// Convert tab: video + audio files, recursive, sorted by path.
ipcMain.handle('scan-media-folder', (_, folderPath) => scanFolderRecursive(folderPath, MEDIA_EXTS).sort());

// Recursive so NVR/DVR-style exports (hourly subfolders, e.g. "2026Y08M20D00H")
// are found; sorted by full path so chronological naming schemes join in order.
function scanFolder(folderPath) {
  return scanFolderRecursive(folderPath).sort();
}

ipcMain.handle('scan-folder', (_, folderPath) => scanFolder(folderPath));

function hashFileSample(filePath, bytes = 2 * 1024 * 1024) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath, { start: 0, end: bytes - 1 });
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', () => resolve(null));
  });
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a, b) {
  a = a.replace(/\.[^.]+$/, '').toLowerCase();
  b = b.replace(/\.[^.]+$/, '').toLowerCase();
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - levenshtein(a, b) / maxLen;
}

ipcMain.handle('find-duplicates', async (_, { paths, sizeTolerancePct, nameSimilarityPct }) => {
  let allFiles = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) allFiles = allFiles.concat(scanFolderRecursive(p));
      else if (VIDEO_EXTS.test(p)) allFiles.push(p);
    } catch (_) {}
  }
  allFiles = [...new Set(allFiles)];

  const infos = allFiles.map((f) => {
    let size = 0;
    try { size = fs.statSync(f).size; } catch (_) {}
    return { path: f, name: path.basename(f), dir: path.dirname(f), size };
  });

  const used = new Array(infos.length).fill(false);
  const groups = [];
  for (let i = 0; i < infos.length; i++) {
    if (used[i]) continue;
    const group = [infos[i]];
    used[i] = true;
    for (let j = i + 1; j < infos.length; j++) {
      if (used[j]) continue;
      const maxSize = Math.max(infos[i].size, infos[j].size, 1);
      const sizeDiffPct = (Math.abs(infos[i].size - infos[j].size) / maxSize) * 100;
      if (sizeDiffPct > sizeTolerancePct) continue;
      const sim = nameSimilarity(infos[i].name, infos[j].name) * 100;
      if (sim < nameSimilarityPct) continue;
      group.push(infos[j]);
      used[j] = true;
    }
    if (group.length > 1) groups.push(group);
  }

  for (const group of groups) {
    const hashes = await Promise.all(group.map((f) => hashFileSample(f.path)));
    group.forEach((f, idx) => { f.hash = hashes[idx]; });
    group.exact = group.every((f) => f.size === group[0].size) && hashes.every((h) => h && h === hashes[0]);
  }

  groups.sort((a, b) => b.length - a.length);
  return groups;
});

ipcMain.handle('delete-paths', (_, paths) => {
  deleteFiles(paths);
  return { success: true };
});

ipcMain.handle('get-duration', async (_, filePath) => {
  return new Promise((resolve) => {
    execFile(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      (err, stdout) => resolve(err ? null : parseFloat(stdout.trim()) || null));
  });
});

ipcMain.handle('get-info', async (_, filePath) => {
  return new Promise((resolve) => {
    execFile(ffprobePath, ['-v', 'error',
      '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name:format=duration,size',
      '-of', 'json', filePath],
      (err, stdout) => {
        if (err) return resolve({ duration: null, width: null, height: null, size: null });
        try {
          const j = JSON.parse(stdout);
          const stream = (j.streams && j.streams[0]) || {};
          resolve({
            duration: parseFloat(j.format && j.format.duration) || null,
            width: stream.width || null,
            height: stream.height || null,
            vcodec: stream.codec_name || null,
            size: parseInt(j.format && j.format.size) || null,
          });
        } catch (_) { resolve({ duration: null, width: null, height: null, size: null }); }
      });
  });
});

ipcMain.handle('show-in-folder', (_, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('open-folder', (_, folderPath) => shell.openPath(folderPath));

function deleteFiles(paths) {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch (_) {}
  }
}

function deleteEmptyFolders(folderPaths) {
  for (const p of folderPaths) {
    try {
      if (fs.readdirSync(p).length === 0) fs.rmdirSync(p);
    } catch (_) {}
  }
}

function getFileDuration(filePath) {
  return new Promise((resolve) => {
    execFile(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      (err, stdout) => resolve(err ? 0 : (parseFloat(stdout.trim()) || 0)));
  });
}

async function sumDurations(files) {
  const CONC = 8;
  let total = 0;
  for (let i = 0; i < files.length; i += CONC) {
    const batch = files.slice(i, i + CONC);
    const durs = await Promise.all(batch.map(getFileDuration));
    total += durs.reduce((a, b) => a + b, 0);
  }
  return total;
}

const TS_SAFE_INPUT_FLAGS = ['-fflags', '+genpts+discardcorrupt', '-err_detect', 'ignore_err'];

// ── Cancellation: the Stop button kills the running ffmpeg and the half-written output is removed ──
let cancelRequested = false;
const activeProcs = new Set();
function trackProc(proc) { activeProcs.add(proc); proc.on('close', () => activeProcs.delete(proc)); }
function rmQuiet(p) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {} }
ipcMain.handle('begin-job', () => { cancelRequested = false; return true; });
ipcMain.handle('cancel-job', () => {
  cancelRequested = true;
  for (const p of activeProcs) { try { p.kill(); } catch (_) {} }
  return true;
});

function runJoin(fileList, outputFilePath, progressOffset = 0) {
  return new Promise((resolve, reject) => {
    const tmpList = path.join(os.tmpdir(), `vj_concat_${Date.now()}.txt`);
    const listContent = fileList.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(tmpList, listContent, 'utf8');

    // Input flags let MPEG-TS sources with damaged packets join instead of aborting/truncating.
    const ffmpeg = spawn(ffmpegPath, ['-y', ...TS_SAFE_INPUT_FLAGS, '-f', 'concat', '-safe', '0', '-i', tmpList, '-c', 'copy', outputFilePath]);
    trackProc(ffmpeg);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
      if (timeMatch) {
        const [, h, m, s] = timeMatch[timeMatch.length - 1].match(/time=(\d+):(\d+):(\d+\.\d+)/);
        mainWindow.webContents.send('progress', progressOffset + parseInt(h)*3600 + parseInt(m)*60 + parseFloat(s));
      }
    });

    ffmpeg.on('close', (code) => {
      fs.unlink(tmpList, () => {});
      if (cancelRequested) { rmQuiet(outputFilePath); return reject(new Error('Canceled')); }
      if (code === 0) resolve(outputFilePath);
      else reject(new Error(`FFmpeg error (code ${code})\n${stderr.slice(-400)}`));
    });

    ffmpeg.on('error', () => reject(new Error('FFmpeg executable not found.')));
  });
}

function runTrim(inputPath, outputPath, start, end) {
  return new Promise((resolve, reject) => {
    const duration = Math.max(0, end - start);
    const args = ['-y', ...TS_SAFE_INPUT_FLAGS, '-ss', String(start), '-i', inputPath, '-t', String(duration), '-c', 'copy', '-avoid_negative_ts', 'make_zero', outputPath];
    const ffmpeg = spawn(ffmpegPath, args);
    trackProc(ffmpeg);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
      if (timeMatch) {
        const [, h, m, s] = timeMatch[timeMatch.length - 1].match(/time=(\d+):(\d+):(\d+\.\d+)/);
        mainWindow.webContents.send('progress', parseInt(h)*3600 + parseInt(m)*60 + parseFloat(s));
      }
    });

    ffmpeg.on('close', (code) => {
      if (cancelRequested) { rmQuiet(outputPath); return reject(new Error('Canceled')); }
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg error (code ${code})\n${stderr.slice(-400)}`));
    });

    ffmpeg.on('error', () => reject(new Error('FFmpeg executable not found.')));
  });
}

ipcMain.handle('cut-video', async (_, { inputPath, outputPath, start, end, deleteSource }) => {
  await runTrim(inputPath, outputPath, start, end);
  if (deleteSource) deleteFiles([inputPath]);
  return { success: true, outputPath };
});

ipcMain.handle('join-videos', async (_, { files, outputPath, deleteSource }) => {
  await runJoin(files, outputPath);
  if (deleteSource) deleteFiles(files);
  return { success: true, outputPath };
});

ipcMain.handle('join-folders', async (_, { folders, outputFolder, outputFile, mode, deleteSource }) => {
  const perFolderOutputs = [];
  const allFiles = folders.flatMap(f => f.files);
  if (!allFiles.length) {
    throw new Error('No video files found in the selected folder(s).');
  }

  mainWindow.webContents.send('batch-status', {
    step: `Calculating total duration of ${allFiles.length} files…`, index: 0, total: 1,
  });
  const folderDurations = await Promise.all(folders.map(f => sumDurations(f.files)));
  let grandTotal = folderDurations.reduce((a, b) => a + b, 0);
  if (mode === 'both') grandTotal *= 2;
  mainWindow.webContents.send('progress-total', grandTotal);

  let cumulative = 0;

  if (mode === 'per-folder' || mode === 'both') {
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      if (cancelRequested) throw new Error('Canceled');
      if (!folder.files.length) continue;
      mainWindow.webContents.send('batch-status', {
        step: `Joining folder ${i+1}/${folders.length}: ${folder.name}`,
        index: i, total: folders.length + (mode === 'both' ? 1 : 0),
      });
      const outPath = path.join(outputFolder, `${folder.name}.mp4`);
      await runJoin(folder.files, outPath, cumulative);
      cumulative += folderDurations[i];
      perFolderOutputs.push(outPath);
    }
  }

  if (mode === 'all-in-one') {
    mainWindow.webContents.send('batch-status', {
      step: `Joining all ${allFiles.length} files into one…`, index: 0, total: 1,
    });
    await runJoin(allFiles, outputFile, 0);
    if (deleteSource) { deleteFiles(allFiles); deleteEmptyFolders(folders.map(f => f.path)); }
    return { success: true, outputFile, perFolderOutputs: [] };
  }

  if (mode === 'both') {
    mainWindow.webContents.send('batch-status', {
      step: `Merging ${perFolderOutputs.length} folders into final file…`,
      index: folders.length, total: folders.length + 1,
    });
    await runJoin(perFolderOutputs, outputFile, cumulative);
    if (deleteSource) { deleteFiles(allFiles); deleteEmptyFolders(folders.map(f => f.path)); }
    return { success: true, outputFile, perFolderOutputs };
  }

  if (deleteSource) { deleteFiles(allFiles); deleteEmptyFolders(folders.map(f => f.path)); }
  return { success: true, outputFile: null, perFolderOutputs };
});

// ─── Convert ──────────────────────────────────────────────────────────────────
const SPEED_MAP_CONV = { fastest:'ultrafast', fast:'fast', balanced:'medium', slow:'slow', slowest:'veryslow' };
const RES_MAP_CONV   = { p480:480, p720:720, p1080:1080, p1440:1440, p2160:2160 };

// Audio-only containers: a video stream can't be muxed into these, so we force
// audio-only and pick a codec the container actually supports.
const AUDIO_FORMATS = new Set(['mp3','aac','flac','wav','ogg','opus','m4a','wma','aiff','alac','ac3']);
const AUDIO_CODEC_BY_FMT = { mp3:'libmp3lame', m4a:'aac', aac:'aac', flac:'flac', wav:'pcm_s16le', ogg:'libvorbis', opus:'libopus', aiff:'pcm_s16le', ac3:'ac3' };
const LOSSLESS_ACODECS = new Set(['flac','pcm_s16le','pcm_s24le','alac']);

function isAudioOnly(s) { return !!s.audioOnly || AUDIO_FORMATS.has(s.fmt); }

// Pick the real video encoder: swap to a hardware encoder when requested & available.
function effectiveVcodec(s) {
  if (s.hwaccel && hwEncoders[s.vcodec]) return hwEncoders[s.vcodec];
  return s.vcodec || 'libx264';
}

// pass: 0 = single pass, 1 = first analysis pass, 2 = final pass
function buildConvertArgs(inputPath, outputPath, s, pass = 0) {
  const cmd = ['-y', '-fflags', '+genpts+discardcorrupt+igndts', '-err_detect', 'ignore_err'];
  if (s.trimStart) cmd.push('-ss', s.trimStart);
  cmd.push('-i', inputPath);
  if (s.trimEnd) cmd.push('-to', s.trimEnd);

  const audioOnly = isAudioOnly(s);
  const vcodec = effectiveVcodec(s);
  const vfParts = [];

  if (audioOnly) {
    cmd.push('-vn');
  } else {
    cmd.push('-c:v', vcodec);
    // HEVC copied into MP4/MOV needs the hvc1 tag to play in Windows/Apple players (H.264 must NOT get it)
    if (vcodec === 'copy' && s.srcVcodec === 'hevc' && ['mp4', 'mov', 'm4v'].includes(s.fmt || 'mp4')) cmd.push('-tag:v', 'hvc1');
    if (vcodec !== 'copy') {
      const cq = Math.max(0, Math.min(51, Math.round((100 - (s.quality || 55)) * 51 / 100)));
      const preset = SPEED_MAP_CONV[s.speed] || 'medium';
      if (vcodec.includes('nvenc')) {
        cmd.push('-preset', 'p4', '-rc', 'vbr', '-cq', String(cq), '-b:v', '0');
      } else if (vcodec.includes('amf')) {
        cmd.push('-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(cq), '-qp_p', String(cq));
      } else if (vcodec.includes('qsv')) {
        cmd.push('-preset', preset, '-global_quality', String(cq));
      } else if (s.crfMode === false || pass !== 0) {
        // two-pass is incompatible with CRF — it requires a target bitrate
        cmd.push('-b:v', s.avgBitrate || '2M', '-preset', preset);
      } else {
        cmd.push('-crf', String(cq), '-preset', preset);
      }
      if (s.res && s.res !== 'original') {
        const h = RES_MAP_CONV[s.res];
        if (h) vfParts.push(`scale=-2:${h}`);
      }
    }
  }

  if (s.fps) vfParts.push(`fps=${s.fps}`);
  if (s.flipH) vfParts.push('hflip');
  if (s.flipV) vfParts.push('vflip');
  if (s.rotate) {
    const angles = { 90:'transpose=1', 180:'transpose=1,transpose=1', 270:'transpose=2' };
    if (angles[s.rotate]) vfParts.push(angles[s.rotate]);
  }
  if (s.denoise) vfParts.push(`hqdn3d=${s.denoise}`);
  if (s.burnSubs && s.subFile) {
    const escaped = s.subFile.replace(/\\/g, '/').replace(/:/g, '\\:');
    vfParts.push(`subtitles='${escaped}'`);
  }
  if (vfParts.length && !audioOnly) cmd.push('-vf', vfParts.join(','));

  if (s.includeAudio === false && !audioOnly) {
    cmd.push('-an');
  } else {
    let acodec = s.acodec || 'aac';
    // an audio container dictates its codec — don't try to put e.g. aac into a .flac
    if (acodec !== 'copy' && AUDIO_FORMATS.has(s.fmt)) acodec = AUDIO_CODEC_BY_FMT[s.fmt] || acodec;
    cmd.push('-c:a', acodec);
    if (acodec !== 'copy') {
      if (!LOSSLESS_ACODECS.has(acodec)) cmd.push('-b:a', s.abitrate || '192k');
      if (s.channels) cmd.push('-ac', String(s.channels));
      if (s.sampleRate) cmd.push('-ar', String(s.sampleRate));
      if (!audioOnly) cmd.push('-async', '1');
    }
  }

  if ((s.fmt || 'mp4') === 'mp4' && s.faststart && !audioOnly) cmd.push('-movflags', '+faststart');
  if (s.extraFlags) cmd.push(...s.extraFlags.trim().split(/\s+/).filter(Boolean));

  if (pass === 1)      cmd.push('-pass', '1', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null');
  else if (pass === 2) cmd.push('-pass', '2', outputPath);
  else                 cmd.push(outputPath);
  return cmd;
}

function uniqueOutputPath(p) {
  if (!fs.existsSync(p)) return p;
  const ext = path.extname(p);
  const base = p.slice(0, p.length - ext.length);
  let i = 1;
  while (fs.existsSync(`${base}_${i}${ext}`)) i++;
  return `${base}_${i}${ext}`;
}

function runFfmpeg(args, progressOffset = 0) {
  return new Promise((resolve, reject) => {
    // run in tmpdir so two-pass log files don't land in a read-only install dir
    const ffmpeg = spawn(ffmpegPath, args, { cwd: os.tmpdir() });
    trackProc(ffmpeg);
    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
      const m = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
      if (m) {
        const [, h, mn, sc] = m[m.length - 1].match(/time=(\d+):(\d+):(\d+\.\d+)/);
        mainWindow.webContents.send('progress', progressOffset + parseInt(h)*3600 + parseInt(mn)*60 + parseFloat(sc));
      }
    });
    ffmpeg.on('close', (code) => cancelRequested ? reject(new Error('Canceled')) : code === 0
      ? resolve(true)
      : reject(new Error(`FFmpeg error (code ${code})\n${stderr.slice(-500)}`)));
    ffmpeg.on('error', () => reject(new Error('FFmpeg executable not found.')));
  });
}

function verifyOutput(outPath, srcDuration, mode) {
  return new Promise((resolve) => {
    if (mode === 'off') return resolve(true);
    execFile(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', outPath], (err, stdout) => {
      const dur = err ? 0 : (parseFloat(stdout.trim()) || 0);
      if (dur < Math.max(1.0, (srcDuration || 0) * 0.9)) return resolve(false);
      if (mode === 'full') {
        execFile(ffmpegPath, ['-v', 'error', '-i', outPath, '-f', 'null', '-'],
          { timeout: 300000 }, (e2) => resolve(!e2));
      } else {
        resolve(true);
      }
    });
  });
}

ipcMain.handle('convert-video', async (_, { inputPath, outputPath, settings, srcDuration, srcVcodec }) => {
  const s = { ...(settings || {}), srcVcodec };
  if (cancelRequested) throw new Error('Canceled');
  const outPath = uniqueOutputPath(outputPath);
  const vcodec = effectiveVcodec(s);
  const twoPass = s.twoPass && vcodec !== 'copy' && !isAudioOnly(s);

  try {
    if (twoPass) {
      await runFfmpeg(buildConvertArgs(inputPath, outPath, s, 1));
      await runFfmpeg(buildConvertArgs(inputPath, outPath, s, 2));
    } else {
      await runFfmpeg(buildConvertArgs(inputPath, outPath, s, 0));
    }
  } catch (err) {
    if (cancelRequested) rmQuiet(outPath);
    throw err;
  }

  const verified = await verifyOutput(outPath, srcDuration, s.verifyMode || 'quick');
  return { success: true, outputPath: outPath, verified };
});

ipcMain.handle('detect-hw', async () => hwEncoders);

ipcMain.handle('pick-subtitle', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Subtitle File', properties: ['openFile'],
    filters: [{ name: 'Subtitles', extensions: ['srt','ass','ssa','vtt','sub'] }],
  });
  return (r.filePaths && r.filePaths[0]) || null;
});
