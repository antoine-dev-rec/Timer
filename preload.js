const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  displays: () => ipcRenderer.invoke('displays'),
  place: (o) => ipcRenderer.invoke('place', o),
  toggle: () => ipcRenderer.invoke('toggle'),
  onTop: (v) => ipcRenderer.invoke('ontop', v),
  onDisplays: (cb) => ipcRenderer.on('displays-changed', () => cb()),
  onCmd: (cb) => ipcRenderer.on('cmd', (_e, c) => cb(c)),
  remoteInfo: () => ipcRenderer.invoke('remoteinfo'),
  setNet: (n) => ipcRenderer.invoke('setnet', n),
  pushState: (s) => ipcRenderer.send('state', s),
  pushFull: (f) => ipcRenderer.send('full', f),
  pushImg: (d) => ipcRenderer.send('img', d),
  onPatch: (cb) => ipcRenderer.on('patch', (_e, p) => cb(p))
});
