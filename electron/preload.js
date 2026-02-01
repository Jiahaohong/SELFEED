import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('selfeed', {
  platform: process.platform,
  versions: process.versions
});
