const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('selfeed', {
  platform: process.platform,
  versions: process.versions
});
