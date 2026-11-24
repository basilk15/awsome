const { contextBridge, ipcRenderer } = require('electron');

const commands = new Set([
  'list_profiles', 'list_regions', 'fetch_topology', 'get_scan_progress', 'cancel_scan',
  'save_snapshot', 'list_snapshots', 'load_snapshot', 'delete_snapshot',
  'preview_prune_snapshots', 'prune_snapshots', 'migration_status', 'read_legacy_planning'
]);

contextBridge.exposeInMainWorld('awsomeDesktop', {
  async invoke(command, args = {}) {
    if (!commands.has(command)) throw new Error('Unknown desktop command');
    const response = await ipcRenderer.invoke('awsome:invoke', command, args);
    if (!response.ok) throw new Error(response.error);
    return response.result;
  }
});
