// ─── State ────────────────────────────────────────────────────────────────────
let files = [];
let outputPath = null;

let folders = [];        // [{ path, name, files: [paths] }]
let folderOutputDir = null;
let finalOutputFile = null;
let folderMode = 'per-folder';

// ─── DOM ──────────────────────────────────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const browseBtn      = document.getElementById('browse-btn');
const fileList       = document.getElementById('file-list');
const listTitle      = document.getElementById('list-title');
const clearAllBtn    = document.getElementById('clear-all-btn');
const outputRow      = document.getElementById('output-row');
const outputDirEl    = document.getElementById('output-dir');
const outputNameEl   = document.getElementById('output-name');
const outputBrowseBtn= document.getElementById('output-browse-btn');
const saveSourceFiles = document.getElementById('save-source-files');
const defaultNameFiles = document.getElementById('default-name-files');
const joinBtn        = document.getElementById('join-btn');

const folderDropZone    = document.getElementById('folder-drop-zone');
const browseFoldersBtn  = document.getElementById('browse-folders-btn');
const folderList        = document.getElementById('folder-list');
const folderListTitle   = document.getElementById('folder-list-title');
const clearFoldersBtn   = document.getElementById('clear-folders-btn');
const folderOutputRow   = document.getElementById('folder-output-row');
const folderOutputPathEl= document.getElementById('folder-output-path');
const finalOutputRow    = document.getElementById('final-output-row');
const finalOutputDirEl  = document.getElementById('final-output-dir');
const finalOutputNameEl = document.getElementById('final-output-name');
const finalOutputBrowseBtn = document.getElementById('final-output-browse-btn');
const saveSourceFolders = document.getElementById('save-source-folders');
const defaultNameFolders = document.getElementById('default-name-folders');
const folderJoinBtn     = document.getElementById('folder-join-btn');

const deleteSourceFiles   = document.getElementById('delete-source-files');
const openFolderFiles     = document.getElementById('open-folder-files');
const deleteSourceFolders = document.getElementById('delete-source-folders');
const openFolderFolders   = document.getElementById('open-folder-folders');

const queueTotals    = document.getElementById('queue-totals');
const qtCount        = document.getElementById('qt-count');
const qtDuration     = document.getElementById('qt-duration');

const overlay       = document.getElementById('progress-overlay');
const progressTitle = document.getElementById('progress-title');
const currentOpName = document.getElementById('current-op-name');
const batchStep     = document.getElementById('batch-step');
const batchBar      = document.getElementById('batch-progress-bar');
const progressBar   = document.getElementById('progress-bar');
const progressLbl   = document.getElementById('progress-label');
const statElapsed   = document.getElementById('stat-elapsed');
const statRemaining = document.getElementById('stat-remaining');
const toast         = document.getElementById('toast');
let overlayTimer = null;
let jobTotalDuration = null;
let jobProcessedSec = 0;
let overlayStart = 0;

// ─── Window controls ──────────────────────────────────────────────────────────
document.getElementById('btn-min').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-max').addEventListener('click', () => window.api.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ─── Global drag & drop routing ────────────────────────────────────────────────
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v)$/i;
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const items = [...e.dataTransfer.items];
  const folderPaths = [], filePaths = [];
  items.forEach((item, i) => {
    const f = e.dataTransfer.files[i];
    if (!f || !f.path) return;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry && entry.isDirectory) folderPaths.push(f.path);
    else if (VIDEO_EXT.test(f.name)) filePaths.push(f.path);
  });
  if (folderPaths.length) {
    switchTab('folders');
    await addFolderPaths(folderPaths);
  } else if (filePaths.length) {
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    if (activeTab === 'cut') {
      await setCutFile(filePaths[0]);
    } else if (activeTab === 'convert') {
      await addConvFiles(filePaths);
    } else {
      switchTab('files');
      await addFilePaths(filePaths);
    }
  } else {
    showToast('No supported video files or folders dropped', 'error');
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(sec) {
  if (!sec) return '?';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function basename(p) { return p.split(/[\\/]/).pop(); }
function dirname(p) { const sep = p.includes('\\') ? '\\' : '/'; const parts = p.split(/[\\/]/); parts.pop(); return parts.join(sep); }
function sepOf(p) { return p.includes('\\') ? '\\' : '/'; }
function joinPath(dir, name) { return dir + sepOf(dir || name) + name; }

// Wires a {dirEl, nameInput, browseBtn, row} group to a full-path getter/setter, with
// "save to source folder" / "use default name" checkboxes that re-derive the path from
// getDefault() (source-based dir+name) unless the user has typed/browsed a custom value.
function setupOutputField({ dirEl, nameInput, browseBtn, row, srcCheckbox, nameCheckbox, getDefault, getPath, setPath, pickFn, onChange }) {
  let customDir = null, customName = null;

  function recompute() {
    const def = getDefault();
    const dir = srcCheckbox.checked ? (def ? def.dir : customDir) : (customDir != null ? customDir : (def ? def.dir : null));
    const name = nameCheckbox.checked ? (def ? def.name : customName) : (customName != null ? customName : (def ? def.name : null));
    if (!dir || !name) {
      dirEl.textContent = dirEl.dataset.placeholder; nameInput.style.display = 'none';
      browseBtn.style.display = srcCheckbox.checked ? 'none' : '';
      row.classList.remove('has-path'); setPath(null); return;
    }
    setPath(joinPath(dir, name));
    dirEl.textContent = dir + sepOf(dir);
    nameInput.value = name;
    nameInput.style.display = '';
    nameInput.disabled = nameCheckbox.checked;
    browseBtn.style.display = srcCheckbox.checked ? 'none' : '';
    row.classList.add('has-path');
  }
  nameInput.addEventListener('click', (e) => e.stopPropagation());
  nameInput.addEventListener('change', () => {
    if (!nameInput.value.trim()) return;
    customName = nameInput.value.trim();
    recompute(); onChange && onChange();
  });
  browseBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const p = await pickFn(getPath());
    if (p) { customDir = dirname(p); customName = basename(p); recompute(); onChange && onChange(); }
  });
  srcCheckbox.addEventListener('change', () => { recompute(); onChange && onChange(); });
  nameCheckbox.addEventListener('change', () => { recompute(); onChange && onChange(); });
  return recompute;
}
function showToast(msg, type = 'success', dur = 4000) {
  toast.textContent = msg;
  toast.className = `show ${type}`;
  setTimeout(() => { toast.className = ''; }, dur);
}

// ════════════════════════════════════════════════════════════════════════════
// FILES TAB
// ════════════════════════════════════════════════════════════════════════════

function updateFilesUI() {
  listTitle.textContent = `Queue (${files.length})`;
  const ready = files.length >= 2 && !!outputPath;
  joinBtn.disabled = !ready;
  joinBtn.textContent = files.length ? `Join ${files.length} Video${files.length !== 1 ? 's' : ''}` : 'Join Videos';

  const statusLine = document.getElementById('status-line-files');
  if (statusLine) {
    if (ready) { statusLine.textContent = `Ready — ${files.length} videos will be merged into ${basename(outputPath)}`; statusLine.classList.add('ready'); }
    else if (files.length < 2) { statusLine.textContent = 'Add at least 2 videos to continue'; statusLine.classList.remove('ready'); }
    else { statusLine.textContent = 'Choose an output file to continue'; statusLine.classList.remove('ready'); }
  }

  if (files.length) {
    queueTotals.classList.remove('hidden');
    qtCount.textContent = files.length;
    const totalSec = files.reduce((a, f) => a + (f.duration || 0), 0);
    qtDuration.textContent = fmtDuration(totalSec);
  } else {
    queueTotals.classList.add('hidden');
  }
  renderFileList();
}

function renderFileList() {
  if (!files.length) {
    fileList.innerHTML = `<li class="empty-state">
      <div class="empty-icon">🎞️</div>
      <div class="empty-title">No videos added yet</div>
      <div class="empty-sub">Drag videos here, or click Browse Files above</div>
    </li>`;
    return;
  }
  fileList.innerHTML = '';
  files.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'file-item'; li.draggable = true; li.dataset.index = i;
    const res = (f.width && f.height) ? `${f.width}×${f.height}` : '—';
    li.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="file-index">${i+1}</span>
      <span class="file-icon">🎞️</span>
      <div class="file-info">
        <div class="file-name" title="${f.path}">${f.name}</div>
        <div class="file-meta"><span>${res}</span><span class="dot">·</span><span title="${f.path}">${f.path}</span></div>
      </div>
      <span class="file-duration">${fmtDuration(f.duration)}</span>
      <button class="remove-btn" data-index="${i}">✕</button>`;
    attachDragEvents(li);
    fileList.appendChild(li);
  });
}

async function addFilePaths(paths) {
  for (const p of paths) {
    if (files.some(f => f.path === p)) continue;
    const entry = { path: p, name: basename(p), duration: null, width: null, height: null };
    files.push(entry);
    refreshOutputField();
    updateFilesUI();
    const info = await window.api.getInfo(p);
    entry.duration = info.duration; entry.width = info.width; entry.height = info.height;
    updateFilesUI();
  }
}

browseBtn.addEventListener('click', async (e) => { e.stopPropagation(); const p = await window.api.openFiles(); if (p.length) await addFilePaths(p); });
dropZone.addEventListener('click', async () => { const p = await window.api.openFiles(); if (p.length) await addFilePaths(p); });
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over'); });
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over');
  const paths = [...e.dataTransfer.files].filter(f => /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v)$/i.test(f.name)).map(f => f.path);
  if (paths.length) await addFilePaths(paths); else showToast('No supported video files dropped', 'error');
});

fileList.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-btn'); if (!btn) return;
  files.splice(parseInt(btn.dataset.index), 1); refreshOutputField(); updateFilesUI();
});
clearAllBtn.addEventListener('click', () => { files = []; refreshOutputField(); updateFilesUI(); });

outputDirEl.dataset.placeholder = 'Click Browse to choose a destination…';
const refreshOutputField = setupOutputField({
  dirEl: outputDirEl, nameInput: outputNameEl, browseBtn: outputBrowseBtn, row: outputRow,
  srcCheckbox: saveSourceFiles, nameCheckbox: defaultNameFiles,
  getDefault: () => files.length ? { dir: dirname(files[0].path), name: 'joined_output.mp4' } : null,
  getPath: () => outputPath, setPath: (p) => { outputPath = p; },
  pickFn: (cur) => window.api.pickOutput(cur), onChange: updateFilesUI,
});

// Drag reorder
let dragSrcIndex = null;
function attachDragEvents(li) {
  li.addEventListener('dragstart', (e) => { dragSrcIndex = parseInt(li.dataset.index); li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  li.addEventListener('dragend', () => document.querySelectorAll('.file-item').forEach(el => el.classList.remove('dragging','drag-target-above','drag-target-below')));
  li.addEventListener('dragover', (e) => {
    e.preventDefault(); const ti = parseInt(li.dataset.index); if (ti === dragSrcIndex) return;
    document.querySelectorAll('.file-item').forEach(el => el.classList.remove('drag-target-above','drag-target-below'));
    const mid = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2;
    li.classList.add(e.clientY < mid ? 'drag-target-above' : 'drag-target-below');
  });
  li.addEventListener('drop', (e) => {
    e.preventDefault(); const ti = parseInt(li.dataset.index); if (ti === dragSrcIndex) return;
    const mid = li.getBoundingClientRect().top + li.getBoundingClientRect().height / 2;
    const after = e.clientY >= mid;
    const moved = files.splice(dragSrcIndex, 1)[0];
    let at = ti; if (dragSrcIndex < ti) at = after ? ti : ti - 1; else at = after ? ti + 1 : ti;
    files.splice(Math.max(0, at), 0, moved); updateFilesUI();
  });
}

joinBtn.addEventListener('click', async () => {
  if (files.length < 2 || !outputPath) return;
  showOverlay('Joining Videos…');
  setCurrentOp(`Merging ${files.length} clips → ${basename(outputPath)}`);
  jobTotalDuration = files.reduce((s, f) => s + (f.duration || 0), 0);
  window.api.onProgress((sec) => {
    progressLbl.textContent = `Processing… ${fmtDuration(sec)}`;
    jobProcessedSec = sec;
    const pct = jobTotalDuration ? Math.min(100, (sec / jobTotalDuration) * 100) : 60;
    progressBar.style.width = pct + '%';
    batchBar.style.width = pct + '%';
  });
  try {
    const r = await window.api.joinVideos({
      files: files.map(f => f.path), outputPath,
      deleteSource: deleteSourceFiles.checked,
    });
    finishOverlay(); showToast(`✓ Saved: ${basename(r.outputPath)}`, 'success', 5000);
    if (deleteSourceFiles.checked) { files = []; updateFilesUI(); }
    if (openFolderFiles.checked) window.api.showInFolder(r.outputPath);
  } catch(err) { hideOverlay(); showToast('Error: ' + err.message.split('\n')[0], 'error', 6000); }
  finally { window.api.removeAllListeners(); }
});

// ════════════════════════════════════════════════════════════════════════════
// FOLDERS TAB
// ════════════════════════════════════════════════════════════════════════════

function updateFoldersUI() {
  const totalFiles = folders.reduce((a, f) => a + f.files.length, 0);
  folderListTitle.textContent = `Folders (${folders.length}) · ${totalFiles} files`;
  const needFinal = folderMode === 'all-in-one' || folderMode === 'both';
  finalOutputRow.style.display = needFinal ? 'flex' : 'none';
  document.getElementById('final-output-label').style.display = needFinal ? 'block' : 'none';
  const ready = folders.length > 0 && totalFiles > 0 && folderOutputDir &&
    (needFinal ? !!finalOutputFile : true);
  folderJoinBtn.disabled = !ready;
  folderJoinBtn.textContent = folders.length ? `Join ${folders.length} Folder${folders.length !== 1 ? 's' : ''}` : 'Join Folders';

  const statusLine = document.getElementById('status-line-folders');
  if (statusLine) {
    if (ready) { statusLine.textContent = `Ready — ${folders.length} folders (${totalFiles} files) will be processed`; statusLine.classList.add('ready'); }
    else if (!folders.length) { statusLine.textContent = 'Add at least one folder to continue'; statusLine.classList.remove('ready'); }
    else if (!totalFiles) { statusLine.textContent = 'No video files found in the selected folder(s) — check they contain video clips'; statusLine.classList.remove('ready'); }
    else if (!folderOutputDir) { statusLine.textContent = 'Choose an output folder to continue'; statusLine.classList.remove('ready'); }
    else { statusLine.textContent = 'Set the final merged file destination to continue'; statusLine.classList.remove('ready'); }
  }
  renderFolderList();
}

function renderFolderList() {
  if (!folders.length) {
    folderList.innerHTML = `<li class="empty-state">
      <div class="empty-icon">📁</div>
      <div class="empty-title">No folders added yet</div>
      <div class="empty-sub">Drag folders here, or click Browse Folders above</div>
    </li>`;
    return;
  }
  folderList.innerHTML = '';
  folders.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'folder-item';
    li.innerHTML = `
      <div class="folder-header" data-idx="${i}">
        <span class="folder-toggle">▶</span>
        <span class="folder-icon">📁</span>
        <div class="folder-info">
          <div class="folder-name">${f.name}</div>
          <div class="folder-meta">${f.files.length} video file${f.files.length !== 1 ? 's' : ''} · ${f.path}</div>
        </div>
        <button class="remove-btn" data-folder-idx="${i}">✕</button>
      </div>
      <div class="folder-files" id="ff-${i}">
        ${f.files.map(fp => `<div class="folder-file-row">${basename(fp)}</div>`).join('')}
      </div>`;
    folderList.appendChild(li);

    li.querySelector('.folder-header').addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      const toggle = li.querySelector('.folder-toggle');
      const filesDiv = li.querySelector('.folder-files');
      toggle.classList.toggle('open');
      filesDiv.classList.toggle('open');
    });
  });
}

folderList.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-btn[data-folder-idx]'); if (!btn) return;
  folders.splice(parseInt(btn.dataset.folderIdx), 1); updateFoldersUI();
});

function mostCommonFileName(allFiles) {
  const counts = {};
  for (const fp of allFiles) {
    const name = basename(fp);
    counts[name] = (counts[name] || 0) + 1;
  }
  let best = null, bestCount = 0;
  for (const fp of allFiles) {
    const name = basename(fp);
    if (counts[name] > bestCount) { best = name; bestCount = counts[name]; }
  }
  return best;
}

function getFinalOutputDefault() {
  if (!folderOutputDir || !folders.length) return null;
  const allFiles = folders.flatMap(f => f.files);
  const common = mostCommonFileName(allFiles) || 'merged_output.mp4';
  const name = /\.[^.]+$/.test(common) ? common.replace(/\.[^.]+$/, '.mp4') : common + '.mp4';
  return { dir: folderOutputDir, name };
}

function setFolderOutputDir(p) {
  folderOutputDir = p;
  if (p) { folderOutputPathEl.textContent = p; folderOutputPathEl.classList.add('has-path'); }
  else { folderOutputPathEl.textContent = 'Click to choose a destination…'; folderOutputPathEl.classList.remove('has-path'); }
  refreshFinalOutputField();
}

async function addFolderPaths(paths) {
  for (const p of paths) {
    if (folders.some(f => f.path === p)) continue;
    const videoFiles = await window.api.scanFolder(p);
    folders.push({ path: p, name: basename(p), files: videoFiles });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  if (saveSourceFolders.checked && !folderOutputDir && folders.length) {
    setFolderOutputDir(dirname(folders[0].path));
  } else {
    refreshFinalOutputField();
  }
  updateFoldersUI();
}

browseFoldersBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const paths = await window.api.openFolders();
  if (paths.length) await addFolderPaths(paths);
});
folderDropZone.addEventListener('click', async () => {
  const paths = await window.api.openFolders();
  if (paths.length) await addFolderPaths(paths);
});
folderDropZone.addEventListener('dragover', (e) => { e.preventDefault(); folderDropZone.classList.add('drag-over'); });
folderDropZone.addEventListener('dragleave', (e) => { if (!folderDropZone.contains(e.relatedTarget)) folderDropZone.classList.remove('drag-over'); });
folderDropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation(); folderDropZone.classList.remove('drag-over');
  const items = [...e.dataTransfer.items];
  const paths = [];
  items.forEach((item, i) => {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry && entry.isDirectory) {
      const f = e.dataTransfer.files[i];
      if (f && f.path) paths.push(f.path);
    }
  });
  if (paths.length) await addFolderPaths(paths);
  else showToast('Drop folders here, not individual files', 'error');
});

clearFoldersBtn.addEventListener('click', () => {
  folders = []; finalOutputFile = null;
  setFolderOutputDir(null);
  updateFoldersUI();
});

// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    folderMode = btn.dataset.mode;
    refreshFinalOutputField();
    updateFoldersUI();
  });
});

folderOutputRow.addEventListener('click', async () => {
  const p = await window.api.pickOutputFolder(folderOutputDir);
  if (p) {
    saveSourceFolders.checked = false;
    setFolderOutputDir(p);
    updateFoldersUI();
  }
});

saveSourceFolders.addEventListener('change', () => {
  if (saveSourceFolders.checked && folders.length) setFolderOutputDir(dirname(folders[0].path));
  else refreshFinalOutputField();
  updateFoldersUI();
});

finalOutputDirEl.dataset.placeholder = 'Click Browse to set final merged file…';
const refreshFinalOutputField = setupOutputField({
  dirEl: finalOutputDirEl, nameInput: finalOutputNameEl, browseBtn: finalOutputBrowseBtn, row: finalOutputRow,
  srcCheckbox: saveSourceFolders, nameCheckbox: defaultNameFolders,
  getDefault: getFinalOutputDefault,
  getPath: () => finalOutputFile, setPath: (p) => { finalOutputFile = p; },
  pickFn: (cur) => window.api.pickOutput(cur), onChange: updateFoldersUI,
});

folderJoinBtn.addEventListener('click', async () => {
  if (!folders.length || !folderOutputDir) return;
  showOverlay('Processing Folders…');
  batchBar.style.width = '0%';

  window.api.onBatchStatus(({ step, index, total }) => {
    batchStep.textContent = `Step ${index+1} of ${total}`;
    setCurrentOp(step);
    if (!jobTotalDuration && total > 0) batchBar.style.width = Math.round((index / total) * 100) + '%';
    progressBar.style.width = '0%';
    progressLbl.textContent = '…';
  });
  window.api.onProgressTotal((total) => { jobTotalDuration = total; });
  window.api.onProgress((sec) => {
    progressLbl.textContent = `Processing… ${fmtDuration(sec)}`;
    jobProcessedSec = sec;
    if (jobTotalDuration && jobTotalDuration > 0) {
      const pct = Math.min(100, (sec / jobTotalDuration) * 100);
      progressBar.style.width = pct + '%';
      batchBar.style.width = pct + '%';
    }
  });

  try {
    const r = await window.api.joinFolders({
      folders: folders.map(f => ({ name: f.name, path: f.path, files: f.files })),
      outputFolder: folderOutputDir,
      outputFile: finalOutputFile,
      mode: folderMode,
      deleteSource: deleteSourceFolders.checked,
    });
    batchBar.style.width = '100%';
    finishOverlay();
    if (folderMode === 'per-folder') showToast(`✓ ${r.perFolderOutputs.length} files saved to output folder`, 'success', 5000);
    else if (folderMode === 'all-in-one') showToast(`✓ Saved: ${basename(r.outputFile)}`, 'success', 5000);
    else showToast(`✓ ${r.perFolderOutputs.length} folder files + final merge saved`, 'success', 5000);
    if (deleteSourceFolders.checked) { folders = []; updateFoldersUI(); }
    if (openFolderFolders.checked) {
      const resultPath = (folderMode === 'all-in-one' || folderMode === 'both') ? r.outputFile : folderOutputDir;
      const folderToOpen = (folderMode === 'all-in-one' || folderMode === 'both') ? dirname(resultPath) : resultPath;
      window.api.openFolder(folderToOpen);
    }
  } catch(err) { hideOverlay(); showToast('Error: ' + err.message.split('\n')[0], 'error', 6000); }
  finally { window.api.removeAllListeners(); }
});

// ─── Overlay helpers ──────────────────────────────────────────────────────────
function showOverlay(title) {
  progressTitle.textContent = title;
  currentOpName.textContent = 'Starting…';
  batchStep.textContent = '';
  batchBar.style.width = '0%';
  progressBar.style.width = '0%';
  progressLbl.textContent = 'Starting…';
  statElapsed.textContent = '0:00';
  statRemaining.textContent = '—';
  overlay.classList.add('active');
  jobTotalDuration = null;
  jobProcessedSec = 0;

  overlayStart = Date.now();
  clearInterval(overlayTimer);
  overlayTimer = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - overlayStart) / 1000);
    statElapsed.textContent = fmtDuration(elapsedSec);
    // Prefer a real estimate from total source duration vs. processed time
    let pct;
    if (jobTotalDuration && jobTotalDuration > 0) {
      pct = Math.min(100, (jobProcessedSec / jobTotalDuration) * 100);
    } else {
      pct = parseFloat(batchBar.style.width) || parseFloat(progressBar.style.width) || 0;
    }
    if (pct > 1) {
      const totalEst = elapsedSec / (pct / 100);
      const remaining = Math.max(0, Math.round(totalEst - elapsedSec));
      statRemaining.textContent = fmtDuration(remaining);
    }
  }, 1000);
}
function setCurrentOp(name) { currentOpName.textContent = name; }
function finishOverlay() {
  progressBar.style.width = '100%';
  batchBar.style.width = '100%';
  progressLbl.textContent = 'Done!';
  currentOpName.textContent = 'Done!';
  statRemaining.textContent = '0:00';
  setTimeout(hideOverlay, 350);
}
function hideOverlay() {
  overlay.classList.remove('active');
  clearInterval(overlayTimer);
}

// ════════════════════════════════════════════════════════════════════════════
// CUT TAB
// ════════════════════════════════════════════════════════════════════════════

let cutFile = null; // { path, name, duration, width, height, size }
let cutStart = 0;
let cutEnd = 0;
let cutOutputPath = null;

const cutDropZone   = document.getElementById('cut-drop-zone');
const browseCutBtn  = document.getElementById('browse-cut-btn');
const cutEmpty      = document.getElementById('cut-empty');
const cutBody       = document.getElementById('cut-body');
const cutFileName   = document.getElementById('cut-file-name');
const cutFileRes    = document.getElementById('cut-file-res');
const cutFileSize   = document.getElementById('cut-file-size');
const cutFileDuration = document.getElementById('cut-file-duration');
const cutRemoveBtn  = document.getElementById('cut-remove-btn');
const cutTrack      = document.getElementById('cut-track');
const cutTrackFill  = document.getElementById('cut-track-fill');
const cutHandleStart= document.getElementById('cut-handle-start');
const cutHandleEnd  = document.getElementById('cut-handle-end');
const cutStartInput = document.getElementById('cut-start-input');
const cutEndInput   = document.getElementById('cut-end-input');
const cutSelectedDuration = document.getElementById('cut-selected-duration');
const deleteSourceCut = document.getElementById('delete-source-cut');
const openFolderCut = document.getElementById('open-folder-cut');
const cutOutputRow  = document.getElementById('cut-output-row');
const cutOutputDirEl = document.getElementById('cut-output-dir');
const cutOutputNameEl = document.getElementById('cut-output-name');
const cutOutputBrowseBtn = document.getElementById('cut-output-browse-btn');
const saveSourceCut = document.getElementById('save-source-cut');
const defaultNameCut = document.getElementById('default-name-cut');
const cutBtn        = document.getElementById('cut-btn');

function fmtSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024*1024);
  if (mb > 1024) return (mb/1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function fmtTimeInput(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function parseTimeInput(str) {
  const parts = str.trim().split(':').map(p => parseFloat(p));
  if (parts.some(isNaN)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  return null;
}

function updateCutUI() {
  if (!cutFile) {
    cutEmpty.style.display = 'flex';
    cutBody.style.display = 'none';
    return;
  }
  cutEmpty.style.display = 'none';
  cutBody.style.display = 'flex';

  cutFileName.textContent = cutFile.name;
  cutFileRes.textContent = (cutFile.width && cutFile.height) ? `${cutFile.width}×${cutFile.height}` : '—';
  cutFileSize.textContent = fmtSize(cutFile.size);
  cutFileDuration.textContent = fmtDuration(cutFile.duration);

  const dur = cutFile.duration || 0;
  const startPct = dur ? (cutStart / dur) * 100 : 0;
  const endPct = dur ? (cutEnd / dur) * 100 : 100;
  cutTrackFill.style.left = startPct + '%';
  cutTrackFill.style.right = (100 - endPct) + '%';
  cutHandleStart.style.left = startPct + '%';
  cutHandleEnd.style.left = endPct + '%';

  cutStartInput.value = fmtTimeInput(cutStart);
  cutEndInput.value = fmtTimeInput(cutEnd);
  cutSelectedDuration.textContent = fmtDuration(Math.max(0, cutEnd - cutStart));

  const ready = !!cutOutputPath && cutEnd > cutStart;
  cutBtn.disabled = !ready;
  const statusLine = document.getElementById('status-line-cut');
  if (ready) { statusLine.textContent = `Ready — will cut ${fmtDuration(cutEnd - cutStart)} from ${cutFile.name}`; statusLine.classList.add('ready'); }
  else if (cutEnd <= cutStart) { statusLine.textContent = 'End time must be after start time'; statusLine.classList.remove('ready'); }
  else { statusLine.textContent = 'Choose an output file to continue'; statusLine.classList.remove('ready'); }
}

async function setCutFile(p) {
  const entry = { path: p, name: basename(p), duration: null, width: null, height: null, size: null };
  cutFile = entry;
  cutStart = 0; cutEnd = 0;
  refreshCutOutputField();
  updateCutUI();
  const info = await window.api.getInfo(p);
  entry.duration = info.duration; entry.width = info.width; entry.height = info.height; entry.size = info.size;
  cutEnd = info.duration || 0;
  updateCutUI();
}

browseCutBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const p = await window.api.openFiles();
  if (p.length) await setCutFile(p[0]);
});
cutDropZone.addEventListener('click', async () => {
  const p = await window.api.openFiles();
  if (p.length) await setCutFile(p[0]);
});
cutDropZone.addEventListener('dragover', (e) => { e.preventDefault(); cutDropZone.classList.add('drag-over'); });
cutDropZone.addEventListener('dragleave', (e) => { if (!cutDropZone.contains(e.relatedTarget)) cutDropZone.classList.remove('drag-over'); });
cutDropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation(); cutDropZone.classList.remove('drag-over');
  const paths = [...e.dataTransfer.files].filter(f => /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v)$/i.test(f.name)).map(f => f.path);
  if (paths.length) await setCutFile(paths[0]); else showToast('No supported video file dropped', 'error');
});

cutRemoveBtn.addEventListener('click', () => {
  cutFile = null; cutOutputPath = null;
  refreshCutOutputField();
  updateCutUI();
});

cutOutputDirEl.dataset.placeholder = 'Click Browse to choose a destination…';
const refreshCutOutputField = setupOutputField({
  dirEl: cutOutputDirEl, nameInput: cutOutputNameEl, browseBtn: cutOutputBrowseBtn, row: cutOutputRow,
  srcCheckbox: saveSourceCut, nameCheckbox: defaultNameCut,
  getDefault: () => cutFile ? { dir: dirname(cutFile.path), name: cutFile.name.replace(/\.[^.]+$/, '') + '_trimmed' + (cutFile.name.match(/\.[^.]+$/) || ['.mp4'])[0] } : null,
  getPath: () => cutOutputPath, setPath: (p) => { cutOutputPath = p; },
  pickFn: (cur) => window.api.pickCutOutput(cur), onChange: updateCutUI,
});

cutStartInput.addEventListener('change', () => {
  const v = parseTimeInput(cutStartInput.value);
  if (v !== null && cutFile) { cutStart = Math.min(Math.max(0, v), cutFile.duration || v); updateCutUI(); }
});
cutEndInput.addEventListener('change', () => {
  const v = parseTimeInput(cutEndInput.value);
  if (v !== null && cutFile) { cutEnd = Math.min(Math.max(0, v), cutFile.duration || v); updateCutUI(); }
});

// Drag handles on the track
let cutDragHandle = null;
function trackTimeFromEvent(e) {
  if (!cutFile || !cutFile.duration) return 0;
  const rect = cutTrack.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return frac * cutFile.duration;
}
cutHandleStart.addEventListener('mousedown', (e) => { e.preventDefault(); cutDragHandle = 'start'; });
cutHandleEnd.addEventListener('mousedown', (e) => { e.preventDefault(); cutDragHandle = 'end'; });
document.addEventListener('mousemove', (e) => {
  if (!cutDragHandle || !cutFile) return;
  const t = trackTimeFromEvent(e);
  if (cutDragHandle === 'start') cutStart = Math.min(t, cutEnd);
  else cutEnd = Math.max(t, cutStart);
  updateCutUI();
});
document.addEventListener('mouseup', () => { cutDragHandle = null; });

cutBtn.addEventListener('click', async () => {
  if (!cutFile || !cutOutputPath || cutEnd <= cutStart) return;
  showOverlay('Cutting Video…');
  setCurrentOp(`Trimming ${fmtDuration(cutEnd - cutStart)} → ${basename(cutOutputPath)}`);
  jobTotalDuration = Math.max(0, cutEnd - cutStart);
  window.api.onProgress((sec) => {
    progressLbl.textContent = `Processing… ${fmtDuration(sec)}`;
    jobProcessedSec = sec;
    const pct = jobTotalDuration ? Math.min(100, (sec / jobTotalDuration) * 100) : 60;
    progressBar.style.width = pct + '%';
    batchBar.style.width = pct + '%';
  });
  try {
    const r = await window.api.cutVideo({
      inputPath: cutFile.path, outputPath: cutOutputPath,
      start: cutStart, end: cutEnd,
      deleteSource: deleteSourceCut.checked,
    });
    finishOverlay(); showToast(`✓ Saved: ${basename(r.outputPath)}`, 'success', 5000);
    if (deleteSourceCut.checked) { cutFile = null; updateCutUI(); }
    if (openFolderCut.checked) window.api.showInFolder(r.outputPath);
  } catch(err) { hideOverlay(); showToast('Error: ' + err.message.split('\n')[0], 'error', 6000); }
  finally { window.api.removeAllListeners(); }
});

// ─── Duplicates tab ───────────────────────────────────────────────────────────
let dupeSources = [];
let dupeGroups = [];

const dupeDropZone        = document.getElementById('dupe-drop-zone');
const browseDupeFilesBtn  = document.getElementById('browse-dupe-files-btn');
const browseDupeFoldersBtn= document.getElementById('browse-dupe-folders-btn');
const dupeSizeTol         = document.getElementById('dupe-size-tol');
const dupeSizeTolNum      = document.getElementById('dupe-size-tol-num');
const dupeNameSim         = document.getElementById('dupe-name-sim');
const dupeNameSimNum      = document.getElementById('dupe-name-sim-num');
const dupeScanBtn         = document.getElementById('dupe-scan-btn');
const dupeStatus          = document.getElementById('dupe-status');
const dupeList            = document.getElementById('dupe-list');
const dupeListTitle       = document.getElementById('dupe-list-title');
const clearDupesBtn       = document.getElementById('clear-dupes-btn');
const dupeDeleteBtn       = document.getElementById('dupe-delete-btn');
const statusLineDupes     = document.getElementById('status-line-dupes');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

function addDupeSources(paths) {
  for (const p of paths) if (!dupeSources.includes(p)) dupeSources.push(p);
  dupeStatus.textContent = `${dupeSources.length} item(s) queued — click Scan`;
}

async function scanDupes() {
  if (!dupeSources.length) return;
  dupeStatus.textContent = 'Scanning…';
  dupeScanBtn.disabled = true;
  try {
    dupeGroups = await window.api.findDuplicates({
      paths: dupeSources,
      sizeTolerancePct: parseInt(dupeSizeTol.value),
      nameSimilarityPct: parseInt(dupeNameSim.value),
    });
  } catch (err) {
    showToast('Error: ' + err.message.split('\n')[0], 'error', 6000);
    dupeGroups = [];
  }
  dupeScanBtn.disabled = false;
  dupeStatus.textContent = dupeGroups.length ? `${dupeGroups.length} group(s) found` : 'No duplicates found';
  updateDupeUI();
}

function updateDupeUI() {
  dupeListTitle.textContent = `Groups — ${dupeGroups.length} found`;
  if (!dupeGroups.length) {
    dupeList.innerHTML = `<li class="empty-state">
        <div class="empty-icon">🧬</div>
        <div class="empty-title">No duplicates found</div>
        <div class="empty-sub">Drop files or folders above, then click Scan</div>
      </li>`;
    dupeDeleteBtn.disabled = true;
    return;
  }
  dupeList.innerHTML = dupeGroups.map((group, gi) => {
    const rows = group.map((f, fi) => `
      <div class="dupe-file-row">
        <input type="checkbox" class="dupe-check" data-group="${gi}" data-file="${fi}">
        <span class="file-icon">🎬</span>
        <div class="dupe-file-info">
          <div class="dupe-file-name">${escapeHtml(f.name)}</div>
          <div class="dupe-file-dir">${escapeHtml(f.dir)}</div>
        </div>
        <span class="dupe-file-size">${fmtSize(f.size)}</span>
      </div>`).join('');
    return `<li class="dupe-group">
        <div class="dupe-group-header">
          <span class="dupe-badge ${group.exact ? 'exact' : 'similar'}">${group.exact ? 'Exact match' : 'Similar'}</span>
          <span>${group.length} files</span>
        </div>
        ${rows}
      </li>`;
  }).join('');
  dupeList.querySelectorAll('.dupe-check').forEach(cb => cb.addEventListener('change', updateDupeDeleteBtn));
  updateDupeDeleteBtn();
}

function updateDupeDeleteBtn() {
  const checked = dupeList.querySelectorAll('.dupe-check:checked').length;
  dupeDeleteBtn.disabled = checked === 0;
  statusLineDupes.textContent = checked
    ? `${checked} file(s) selected for deletion`
    : 'Select files below, then delete the ones you don\'t want';
}

dupeSizeTol.addEventListener('input', () => { dupeSizeTolNum.value = dupeSizeTol.value; });
dupeNameSim.addEventListener('input', () => { dupeNameSimNum.value = dupeNameSim.value; });
dupeSizeTolNum.addEventListener('input', () => {
  const v = Math.min(20, Math.max(0, parseInt(dupeSizeTolNum.value) || 0));
  dupeSizeTol.value = v;
});
dupeNameSimNum.addEventListener('input', () => {
  const v = Math.min(100, Math.max(0, parseInt(dupeNameSimNum.value) || 0));
  dupeNameSim.value = v;
});
dupeSizeTol.addEventListener('change', () => { if (dupeSources.length) scanDupes(); });
dupeNameSim.addEventListener('change', () => { if (dupeSources.length) scanDupes(); });
dupeSizeTolNum.addEventListener('change', () => {
  dupeSizeTolNum.value = dupeSizeTol.value;
  if (dupeSources.length) scanDupes();
});
dupeNameSimNum.addEventListener('change', () => {
  dupeNameSimNum.value = dupeNameSim.value;
  if (dupeSources.length) scanDupes();
});

dupeScanBtn.addEventListener('click', scanDupes);

browseDupeFilesBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const paths = await window.api.openFiles();
  if (paths.length) { addDupeSources(paths); scanDupes(); }
});
browseDupeFoldersBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const paths = await window.api.openFolders();
  if (paths.length) { addDupeSources(paths); scanDupes(); }
});
dupeDropZone.addEventListener('click', async () => {
  const paths = await window.api.openFiles();
  if (paths.length) { addDupeSources(paths); scanDupes(); }
});
dupeDropZone.addEventListener('dragover', (e) => { e.preventDefault(); dupeDropZone.classList.add('drag-over'); });
dupeDropZone.addEventListener('dragleave', (e) => { if (!dupeDropZone.contains(e.relatedTarget)) dupeDropZone.classList.remove('drag-over'); });
dupeDropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation(); dupeDropZone.classList.remove('drag-over');
  const items = [...e.dataTransfer.items];
  const paths = [];
  items.forEach((item, i) => {
    const f = e.dataTransfer.files[i];
    if (!f || !f.path) return;
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry && entry.isDirectory) paths.push(f.path);
    else if (VIDEO_EXT.test(f.name)) paths.push(f.path);
  });
  if (paths.length) { addDupeSources(paths); scanDupes(); }
  else showToast('No supported files or folders dropped', 'error');
});

clearDupesBtn.addEventListener('click', () => {
  dupeSources = []; dupeGroups = [];
  dupeStatus.textContent = '';
  updateDupeUI();
});

dupeDeleteBtn.addEventListener('click', async () => {
  const checked = [...dupeList.querySelectorAll('.dupe-check:checked')];
  const paths = checked.map(cb => dupeGroups[parseInt(cb.dataset.group)][parseInt(cb.dataset.file)].path);
  if (!paths.length) return;
  if (!confirm(`Permanently delete ${paths.length} file(s)?`)) return;
  await window.api.deletePaths(paths);
  showToast(`✓ Deleted ${paths.length} file(s)`, 'success', 5000);
  const toRemove = new Set(checked.map(cb => `${cb.dataset.group}:${cb.dataset.file}`));
  dupeGroups = dupeGroups
    .map((group, gi) => {
      const filtered = group.filter((_, fi) => !toRemove.has(`${gi}:${fi}`));
      filtered.exact = group.exact;
      return filtered;
    })
    .filter(group => group.length > 1);
  updateDupeUI();
});

// ─── Convert tab ──────────────────────────────────────────────────────────────
const CONV_MEDIA_EXT = /\.(mp4|mkv|mov|avi|webm|flv|wmv|m4v|mp3|aac|flac|wav|ogg|m4a|opus|ts|mts|m2ts)$/i;

const CONV_PRESETS = {
  fast:     { fmt:'mp4', vcodec:'libx264', speed:'fast',     quality:60, res:'original', acodec:'aac',     abitrate:'192k', audioOnly:false, hwaccel:true,  faststart:false },
  balanced: { fmt:'mp4', vcodec:'libx264', speed:'balanced', quality:55, res:'original', acodec:'aac',     abitrate:'192k', audioOnly:false, hwaccel:false, faststart:false },
  hq:       { fmt:'mp4', vcodec:'libx265', speed:'slow',     quality:78, res:'original', acodec:'aac',     abitrate:'256k', audioOnly:false, hwaccel:false, faststart:false },
  mobile:   { fmt:'mp4', vcodec:'libx264', speed:'fast',     quality:60, res:'p720',     acodec:'aac',     abitrate:'128k', audioOnly:false, hwaccel:true,  faststart:false },
  youtube:  { fmt:'mp4', vcodec:'libx264', speed:'balanced', quality:55, res:'p1080',    acodec:'aac',     abitrate:'192k', audioOnly:false, hwaccel:false, faststart:true  },
  audio:    { fmt:'mp3', vcodec:'copy',    speed:'fast',     quality:55, res:'original', acodec:'mp3',     abitrate:'192k', audioOnly:true,  hwaccel:false, faststart:false },
  remux:    { fmt:'mp4', vcodec:'copy',    speed:'fast',     quality:55, res:'original', acodec:'aac',     abitrate:'192k', audioOnly:false, hwaccel:false, faststart:false },
  archive:  { fmt:'mkv', vcodec:'libx265', speed:'slowest',  quality:85, res:'original', acodec:'flac',    abitrate:'256k', audioOnly:false, hwaccel:false, faststart:false },
};

let convFiles = [];
let convCustomOutputDir = null;

const convDropZone      = document.getElementById('conv-drop-zone');
const browseConvBtn     = document.getElementById('browse-conv-btn');
const convFmt           = document.getElementById('conv-fmt');
const convVcodec        = document.getElementById('conv-vcodec');
const convQuality       = document.getElementById('conv-quality');
const convQualityNum    = document.getElementById('conv-quality-num');
const convSpeed         = document.getElementById('conv-speed');
const convRes           = document.getElementById('conv-res');
const convFps           = document.getElementById('conv-fps');
const convAcodec        = document.getElementById('conv-acodec');
const convAbitrate      = document.getElementById('conv-abitrate');
const convChannels      = document.getElementById('conv-channels');
const convSampleRate    = document.getElementById('conv-samplerate');
const convRotate        = document.getElementById('conv-rotate');
const convExtra         = document.getElementById('conv-extra');
const convIncludeAudio  = document.getElementById('conv-include-audio');
const convAudioOnly     = document.getElementById('conv-audio-only');
const convFlipH         = document.getElementById('conv-flip-h');
const convFlipV         = document.getElementById('conv-flip-v');
const convSaveSource    = document.getElementById('conv-save-source');
const convDeleteSource  = document.getElementById('conv-delete-source');
const convOpenFolder    = document.getElementById('conv-open-folder');
const convSuffix        = document.getElementById('conv-suffix');
const convOutputRow     = document.getElementById('conv-output-row');
const convOutputDir     = document.getElementById('conv-output-dir');
const convOutputBrowse  = document.getElementById('conv-output-browse-btn');
const convList          = document.getElementById('conv-list');
const convListTitle     = document.getElementById('conv-list-title');
const clearConvBtn      = document.getElementById('clear-conv-btn');
const statusLineConv    = document.getElementById('status-line-conv');
const convBtn           = document.getElementById('conv-btn');
const convDenoise       = document.getElementById('conv-denoise');
const convDenoiseNum    = document.getElementById('conv-denoise-num');
const convTrimStart     = document.getElementById('conv-trim-start');
const convTrimEnd       = document.getElementById('conv-trim-end');
const convSubFile       = document.getElementById('conv-sub-file');
const convSubBrowse     = document.getElementById('conv-sub-browse');
const convSubClear      = document.getElementById('conv-sub-clear');
const convRateMode      = document.getElementById('conv-ratemode');
const convAvgBitrate    = document.getElementById('conv-avg-bitrate');
const convVerify        = document.getElementById('conv-verify');
const convHwaccel       = document.getElementById('conv-hwaccel');
const convTwopass       = document.getElementById('conv-twopass');
const convFaststart     = document.getElementById('conv-faststart');
const convBurnSubs      = document.getElementById('conv-burn-subs');
let convSubPath = null;

function getConvSettings() {
  return {
    fmt:          convFmt.value,
    vcodec:       convVcodec.value,
    quality:      parseInt(convQuality.value),
    speed:        convSpeed.value,
    res:          convRes.value,
    fps:          convFps.value.trim() || null,
    acodec:       convAcodec.value,
    abitrate:     convAbitrate.value,
    channels:     parseInt(convChannels.value),
    sampleRate:   convSampleRate.value,
    rotate:       convRotate.value ? parseInt(convRotate.value) : null,
    extraFlags:   convExtra.value.trim(),
    includeAudio: convIncludeAudio.checked,
    audioOnly:    convAudioOnly.checked,
    flipH:        convFlipH.checked,
    flipV:        convFlipV.checked,
    denoise:      parseInt(convDenoise.value) || 0,
    trimStart:    convTrimStart.value.trim(),
    trimEnd:      convTrimEnd.value.trim(),
    subFile:      convSubPath,
    burnSubs:     convBurnSubs.checked,
    crfMode:      convRateMode.value !== 'bitrate',
    avgBitrate:   convAvgBitrate.value.trim() || '2M',
    verifyMode:   convVerify.value,
    hwaccel:      convHwaccel.checked,
    twoPass:      convTwopass.checked,
    faststart:    convFaststart.checked,
  };
}

function applyConvPreset(key) {
  const p = CONV_PRESETS[key];
  if (!p) return;
  convFmt.value      = p.fmt;
  convVcodec.value   = p.vcodec;
  convQuality.value  = p.quality;
  convQualityNum.value = p.quality;
  convSpeed.value    = p.speed;
  convRes.value      = p.res;
  convAcodec.value   = p.acodec;
  convAbitrate.value = p.abitrate;
  convAudioOnly.checked = p.audioOnly || false;
  convIncludeAudio.checked = !p.audioOnly;
  convFaststart.checked = p.faststart || false;
  if (!convHwaccel.disabled) convHwaccel.checked = p.hwaccel || false;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === key));
}

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyConvPreset(btn.dataset.preset));
});

convQuality.addEventListener('input', () => { convQualityNum.value = convQuality.value; });
convQualityNum.addEventListener('input', () => {
  const v = Math.min(100, Math.max(0, parseInt(convQualityNum.value) || 0));
  convQuality.value = v;
});

convDenoise.addEventListener('input', () => { convDenoiseNum.value = convDenoise.value; });
convDenoiseNum.addEventListener('input', () => {
  const v = Math.min(10, Math.max(0, parseInt(convDenoiseNum.value) || 0));
  convDenoise.value = v;
});

convSubBrowse.addEventListener('click', async (e) => {
  e.stopPropagation();
  const p = await window.api.pickSubtitle();
  if (p) { convSubPath = p; convSubFile.value = p; convBurnSubs.checked = true; }
});
convSubClear.addEventListener('click', (e) => {
  e.stopPropagation();
  convSubPath = null; convSubFile.value = ''; convBurnSubs.checked = false;
});

// Detect hardware encoders; disable the toggle if none are available.
window.api.detectHw().then((hw) => {
  const names = Object.values(hw || {});
  if (!names.length) {
    convHwaccel.checked = false;
    convHwaccel.disabled = true;
    convHwaccel.parentElement.title = 'No hardware encoder detected';
    convHwaccel.parentElement.style.opacity = '0.5';
  } else {
    const tag = names.some(n => n.includes('nvenc')) ? 'NVENC'
              : names.some(n => n.includes('qsv'))   ? 'QSV'
              : names.some(n => n.includes('amf'))   ? 'AMF' : 'HW';
    convHwaccel.parentElement.title = `Available: ${tag}`;
  }
}).catch(() => {});

convSaveSource.addEventListener('change', () => {
  convOutputRow.style.display = convSaveSource.checked ? 'none' : '';
  updateConvUI();
});

convOutputBrowse.addEventListener('click', async (e) => {
  e.stopPropagation();
  const p = await window.api.pickOutputFolder();
  if (p) { convCustomOutputDir = p; convOutputDir.textContent = p; }
});

convAudioOnly.addEventListener('change', () => {
  if (convAudioOnly.checked) convIncludeAudio.checked = true;
});

function convOutputPath(filePath, settings) {
  const dir   = convSaveSource.checked ? dirname(filePath) : (convCustomOutputDir || dirname(filePath));
  const ext   = filePath.match(/\.[^.]+$/)?.[0] || '';
  const stem  = basename(filePath).slice(0, basename(filePath).length - ext.length);
  const suffix = convSuffix.value || '';
  return dir + sepOf(dir) + stem + suffix + '.' + settings.fmt;
}

async function addConvFiles(paths) {
  for (const p of paths) {
    if (convFiles.some(f => f.path === p)) continue;
    const info = await window.api.getInfo(p).catch(() => ({}));
    convFiles.push({ path: p, name: basename(p), duration: info.duration || 0, size: info.size || 0, status: 'pending' });
  }
  updateConvUI();
}

function updateConvUI() {
  convListTitle.textContent = `Queue — ${convFiles.length} file${convFiles.length !== 1 ? 's' : ''}`;
  convBtn.disabled = convFiles.length === 0 || (!convSaveSource.checked && !convCustomOutputDir);

  if (!convFiles.length) {
    convList.innerHTML = `<li class="empty-state">
      <div class="empty-icon">🔄</div>
      <div class="empty-title">No files added yet</div>
      <div class="empty-sub">Drop files above or click Browse Files</div>
    </li>`;
    statusLineConv.textContent = 'Add files to convert';
    return;
  }
  const totalDur = convFiles.reduce((s, f) => s + (f.duration || 0), 0);
  statusLineConv.textContent = `${convFiles.length} file${convFiles.length !== 1 ? 's' : ''} · ${fmtDuration(totalDur)} total`;
  convList.innerHTML = convFiles.map((f, i) => `
    <li class="conv-file-item" data-index="${i}">
      <span class="file-icon">🎬</span>
      <div class="file-info">
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-meta">${fmtSize(f.size)}<span class="dot">·</span>${fmtDuration(f.duration)}</div>
      </div>
      <span class="conv-file-status ${f.status}">${
        f.status === 'pending' ? 'Pending' :
        f.status === 'working' ? 'Converting…' :
        f.status === 'done'    ? '✓ Done' : '✕ Error'
      }</span>
      <button class="remove-btn" data-remove="${i}" title="Remove">✕</button>
    </li>`).join('');

  convList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      convFiles.splice(parseInt(btn.dataset.remove), 1);
      updateConvUI();
    });
  });
}

browseConvBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const p = await window.api.openMedia();
  if (p.length) await addConvFiles(p);
});
convDropZone.addEventListener('click', async () => {
  const p = await window.api.openMedia();
  if (p.length) await addConvFiles(p);
});
convDropZone.addEventListener('dragover', (e) => { e.preventDefault(); convDropZone.classList.add('drag-over'); });
convDropZone.addEventListener('dragleave', (e) => { if (!convDropZone.contains(e.relatedTarget)) convDropZone.classList.remove('drag-over'); });
convDropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation(); convDropZone.classList.remove('drag-over');
  const paths = [...e.dataTransfer.files].filter(f => CONV_MEDIA_EXT.test(f.name)).map(f => f.path);
  if (paths.length) await addConvFiles(paths);
  else showToast('No supported media files dropped', 'error');
});
clearConvBtn.addEventListener('click', () => { convFiles = []; updateConvUI(); });

convBtn.addEventListener('click', async () => {
  if (!convFiles.length) return;
  const settings = getConvSettings();
  const total = convFiles.length;
  showOverlay('Converting Files…');
  jobTotalDuration = convFiles.reduce((s, f) => s + (f.duration || 0), 0);

  for (let i = 0; i < convFiles.length; i++) {
    const f = convFiles[i];
    convFiles[i].status = 'working';
    updateConvUI();
    batchBar.style.width = Math.round((i / total) * 100) + '%';
    setCurrentOp(`Converting ${f.name} (${i+1}/${total})`);
    batchStep.textContent = `File ${i+1} of ${total}`;
    progressBar.style.width = '0%';
    progressLbl.textContent = '…';

    const cumulativeBefore = convFiles.slice(0, i).reduce((s, cf) => s + (cf.duration || 0), 0);
    const fileDur = f.duration || 0;

    window.api.removeAllListeners();
    window.api.onProgress((sec) => {
      // per-file bar = this file's own progress; overall bar = whole queue
      const filePct = fileDur ? Math.min(100, (sec / fileDur) * 100) : 0;
      progressBar.style.width = filePct + '%';
      progressLbl.textContent = fileDur
        ? `${f.name} · ${filePct.toFixed(0)}%`
        : `Processing… ${fmtDuration(sec)}`;
      jobProcessedSec = cumulativeBefore + Math.min(sec, fileDur || sec);  // feeds overlay ETA
      if (jobTotalDuration) {
        const overall = Math.min(100, (jobProcessedSec / jobTotalDuration) * 100);
        batchBar.style.width = overall + '%';
      }
    });

    const outPath = convOutputPath(f.path, settings);
    try {
      const r = await window.api.convertVideo({
        inputPath: f.path, outputPath: outPath, settings, srcDuration: fileDur,
      });
      convFiles[i].status = 'done';
      convFiles[i].outPath = (r && r.outputPath) || outPath;
      if (r && r.verified === false) {
        showToast(`Verify failed on ${f.name} — source kept`, 'error', 6000);
      } else if (convDeleteSource.checked) {
        await window.api.deletePaths([f.path]);
      }
    } catch (err) {
      convFiles[i].status = 'error';
      showToast(`Error on ${f.name}: ${err.message.split('\n')[0]}`, 'error', 7000);
    }
    updateConvUI();
  }

  progressBar.style.width = '100%';
  batchBar.style.width = '100%';
  finishOverlay();
  window.api.removeAllListeners();

  const doneCount = convFiles.filter(f => f.status === 'done').length;
  showToast(`✓ ${doneCount}/${total} file${total !== 1 ? 's' : ''} converted`, 'success', 5000);
  const firstDone = convFiles.find(f => f.status === 'done' && f.outPath);
  if (convOpenFolder.checked && firstDone) {
    window.api.openFolder(dirname(firstDone.outPath));
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
refreshOutputField();
refreshFinalOutputField();
refreshCutOutputField();
updateFilesUI();
updateFoldersUI();
updateCutUI();
