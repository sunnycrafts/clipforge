const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  pickOutput: (defaultPath) => ipcRenderer.invoke('pick-output', defaultPath),
  pickCutOutput: (name) => ipcRenderer.invoke('pick-cut-output', name),
  cutVideo: (opts) => ipcRenderer.invoke('cut-video', opts),
  pickOutputFolder: (defaultPath) => ipcRenderer.invoke('pick-output-folder', defaultPath),
  openFiles: () => ipcRenderer.invoke('open-files'),
  openMedia: () => ipcRenderer.invoke('open-media'),
  openFolders: () => ipcRenderer.invoke('open-folders'),
  scanFolder: (p) => ipcRenderer.invoke('scan-folder', p),
  convertVideo: (opts) => ipcRenderer.invoke('convert-video', opts),
  detectHw: () => ipcRenderer.invoke('detect-hw'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  pickSubtitle: () => ipcRenderer.invoke('pick-subtitle'),
  findDuplicates: (opts) => ipcRenderer.invoke('find-duplicates', opts),
  deletePaths: (paths) => ipcRenderer.invoke('delete-paths', paths),
  getDuration: (p) => ipcRenderer.invoke('get-duration', p),
  getInfo: (p) => ipcRenderer.invoke('get-info', p),
  joinVideos: (opts) => ipcRenderer.invoke('join-videos', opts),
  joinFolders: (opts) => ipcRenderer.invoke('join-folders', opts),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  onProgress: (cb) => ipcRenderer.on('progress', (_, s) => cb(s)),
  onBatchStatus: (cb) => ipcRenderer.on('batch-status', (_, d) => cb(d)),
  onProgressTotal: (cb) => ipcRenderer.on('progress-total', (_, t) => cb(t)),
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('progress');
    ipcRenderer.removeAllListeners('batch-status');
    ipcRenderer.removeAllListeners('progress-total');
  },
});
