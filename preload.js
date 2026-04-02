const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('awsAPI', {
  fetchTopology: (options) => {
    const payload = {
      profile: '',
      region: 'me-south-1'
    };

    if (options && typeof options === 'object') {
      if (typeof options.profile === 'string') {
        payload.profile = options.profile.trim();
      }

      if (typeof options.region === 'string' && options.region.trim()) {
        payload.region = options.region.trim();
      }
    }

    console.log('[preload] Invoking fetch-topology with payload:', payload);
    return ipcRenderer.invoke('fetch-topology', payload);
  }
});
