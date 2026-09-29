import { deserializePlanningDocument, PLANNING_DOCUMENT_STORAGE_KEY } from './planningDocument.mjs';
import {
  PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX,
  planningDocumentLibraryEntryKey,
  upsertPlanningDocument
} from './planning/documentLibrary.mjs';

export const MIGRATION_MARKER = 'awsome.electron.migration.v1';

export function migrateLegacyPlanning(entries, storage, serviceCatalog) {
  const warnings = [];
  let imported = 0;
  const documents = Object.entries(entries || {}).filter(([key]) => key.startsWith(PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX));
  for (const [key, raw] of documents) {
    try {
      const document = deserializePlanningDocument(raw, serviceCatalog);
      if (planningDocumentLibraryEntryKey(document.id) !== key) throw new Error('Document ID does not match its storage key');
      if (storage.getItem(key) != null) continue;
      upsertPlanningDocument(storage, document, serviceCatalog, { preserveUpdatedAt: true });
      imported += 1;
    } catch (error) {
      warnings.push(`Architecture ${key.slice(PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX.length)} could not be imported: ${error.message}`);
    }
  }
  const last = entries?.[PLANNING_DOCUMENT_STORAGE_KEY];
  if (last != null) {
    try {
      const document = deserializePlanningDocument(last, serviceCatalog);
      const key = planningDocumentLibraryEntryKey(document.id);
      const existing = storage.getItem(key);
      if (existing == null) {
        upsertPlanningDocument(storage, document, serviceCatalog, { preserveUpdatedAt: true });
        imported += 1;
      }
      if (storage.getItem(PLANNING_DOCUMENT_STORAGE_KEY) == null) storage.setItem(PLANNING_DOCUMENT_STORAGE_KEY, existing ?? last);
    } catch (error) {
      warnings.push(`The prior current architecture could not be imported: ${error.message}`);
    }
  }
  if (entries?.['awsome.theme'] === 'dark' || entries?.['awsome.theme'] === 'light') {
    if (storage.getItem('awsome.theme') == null) storage.setItem('awsome.theme', entries['awsome.theme']);
  }
  return { imported, warnings };
}
