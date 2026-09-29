import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './main.css';
import App, { PLANNING_SERVICES } from './App';
import { MIGRATION_MARKER, migrateLegacyPlanning } from './migrateLegacyPlanning.mjs';

async function start() {
  const warnings = [];
  if (window.awsomeDesktop?.invoke) {
    try {
      const status = await window.awsomeDesktop.invoke('migration_status');
      warnings.push(...(status.warnings || []));
      if (!window.localStorage.getItem(MIGRATION_MARKER)) {
        const legacy = await window.awsomeDesktop.invoke('read_legacy_planning');
        warnings.push(...(legacy.warnings || []));
        const result = migrateLegacyPlanning(legacy.entries, window.localStorage, PLANNING_SERVICES);
        warnings.push(...result.warnings);
        if (!legacy.warnings?.length && !result.warnings.length) window.localStorage.setItem(MIGRATION_MARKER, '1');
      }
    } catch (error) {
      warnings.push(`Could not finish importing prior local data: ${error.message}`);
    }
  }
  if (warnings.length) window.awsomeMigrationWarning = `Some prior local data could not be imported. ${warnings.join(' ')}`;
  createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
}

start();
