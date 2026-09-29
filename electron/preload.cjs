const { contextBridge, ipcRenderer } = require('electron');

const commands = new Set([
  'list_profiles', 'list_regions', 'fetch_topology', 'get_scan_progress', 'cancel_scan',
  'save_snapshot', 'list_snapshots', 'load_snapshot', 'delete_snapshot',
  'preview_prune_snapshots', 'prune_snapshots', 'migration_status', 'read_legacy_planning'
]);

contextBridge.exposeInMainWorld('awsomeDesktop', {
  invoke(command, args = {}) {
    if (!commands.has(command)) return Promise.reject(new Error('Unknown desktop command'));
    return ipcRenderer.invoke('awsome:invoke', command, args);
  }
});
