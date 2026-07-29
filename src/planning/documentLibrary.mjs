import {
  PLANNING_DOCUMENT_STORAGE_KEY,
  PlanningDocumentError,
  deserializePlanningDocument,
  normalizePlanningDocument,
  touchPlanningDocument
} from '../planningDocument.mjs';

export const PLANNING_DOCUMENT_LIBRARY_SCHEMA = 'graphivo/planning-document-library';
export const PLANNING_DOCUMENT_LIBRARY_VERSION = 1;
export const PLANNING_DOCUMENT_LIBRARY_INDEX_KEY = 'graphivo.planning.library.index';
export const PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX = 'graphivo.planning.library.document.';

export class PlanningDocumentLibraryError extends Error {
  constructor(message, code = 'library_error', details = {}) {
    super(message);
    this.name = 'PlanningDocumentLibraryError';
    this.code = code;
    this.details = details;
  }
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validDocumentId(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new PlanningDocumentLibraryError(
      'Choose an architecture with a valid document id.',
      'invalid_document_id'
    );
  }
  return id.trim();
}

export function planningDocumentLibraryEntryKey(documentId) {
  return `${PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX}${encodeURIComponent(validDocumentId(documentId))}`;
}

function requireReadableStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    throw new PlanningDocumentLibraryError(
      'Local architecture storage is unavailable. Export your architecture as JSON to keep a copy.',
      'storage_unavailable'
    );
  }
}

function requireWritableStorage(storage, { remove = false } = {}) {
  requireReadableStorage(storage);
  if (typeof storage.setItem !== 'function' || (remove && typeof storage.removeItem !== 'function')) {
    throw new PlanningDocumentLibraryError(
      'Local architecture storage cannot be changed. Export your architecture as JSON to keep a copy.',
      'storage_unavailable'
    );
  }
}

function readItem(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    throw new PlanningDocumentLibraryError(
      `Graphivo could not read local architecture storage: ${errorMessage(error)}`,
      'storage_read_failed',
      { key }
    );
  }
}

function writeItem(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    throw new PlanningDocumentLibraryError(
      `Graphivo could not save the architecture library: ${errorMessage(error)}. Export your architecture as JSON to keep a copy.`,
      'storage_write_failed',
      { key }
    );
  }
}

function removeItem(storage, key) {
  try {
    storage.removeItem(key);
  } catch (error) {
    throw new PlanningDocumentLibraryError(
      `Graphivo could not delete the selected architecture: ${errorMessage(error)}. No other local data was targeted.`,
      'storage_delete_failed',
      { key }
    );
  }
}

function summaryFromDocument(document) {
  return {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    nodeCount: document.nodes.length,
    edgeCount: document.edges.length
  };
}

function orderSummaries(summaries) {
  return summaries.sort((left, right) => {
    const updatedDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    return updatedDifference
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id);
  });
}

function indexFromDocuments(documents) {
  return {
    schema: PLANNING_DOCUMENT_LIBRARY_SCHEMA,
    version: PLANNING_DOCUMENT_LIBRARY_VERSION,
    documents: orderSummaries([...documents.values()].map(summaryFromDocument))
  };
}

function parseIndex(rawIndex) {
  if (rawIndex == null) {
    return { ids: [], state: 'absent', warning: null, rawDocumentCount: 0 };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawIndex);
  } catch (error) {
    return {
      ids: [],
      state: 'corrupt',
      rawDocumentCount: 0,
      warning: issue(
        'library_index_corrupt',
        `The architecture library index is not valid JSON: ${errorMessage(error)} Stored entries were left untouched and Graphivo will recover any readable architectures it can find.`
      )
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ids: [],
      state: 'corrupt',
      rawDocumentCount: 0,
      warning: issue(
        'library_index_corrupt',
        'The architecture library index must be a JSON object. Stored entries were left untouched and Graphivo will recover any readable architectures it can find.'
      )
    };
  }

  if (parsed.schema !== PLANNING_DOCUMENT_LIBRARY_SCHEMA) {
    return {
      ids: [],
      state: 'incompatible',
      rawDocumentCount: 0,
      warning: issue(
        'library_index_incompatible_schema',
        `The local architecture library uses an unsupported schema "${String(parsed.schema)}". No library changes will be made; export or back up local data before replacing it.`
      )
    };
  }

  if (parsed.version !== PLANNING_DOCUMENT_LIBRARY_VERSION) {
    const newer = typeof parsed.version === 'number'
      && parsed.version > PLANNING_DOCUMENT_LIBRARY_VERSION;
    return {
      ids: [],
      state: 'incompatible',
      rawDocumentCount: 0,
      warning: issue(
        'library_index_incompatible_version',
        newer
          ? `The local architecture library was created by a newer Graphivo version (${parsed.version}). No library changes will be made.`
          : `The local architecture library version "${String(parsed.version)}" is unsupported. No library changes will be made.`
      )
    };
  }

  if (!Array.isArray(parsed.documents)) {
    return {
      ids: [],
      state: 'corrupt',
      rawDocumentCount: 0,
      warning: issue(
        'library_index_corrupt',
        'The architecture library index has no valid documents list. Stored entries were left untouched and Graphivo will recover any readable architectures it can find.'
      )
    };
  }

  const ids = [];
  const seen = new Set();
  let invalidSummaryCount = 0;
  for (const summary of parsed.documents) {
    const id = typeof summary?.id === 'string' ? summary.id.trim() : '';
    if (!id || seen.has(id)) {
      invalidSummaryCount += 1;
      continue;
    }
    ids.push(id);
    seen.add(id);
  }

  return {
    ids,
    state: 'valid',
    rawDocumentCount: parsed.documents.length,
    warning: invalidSummaryCount
      ? issue(
        'library_index_entries_invalid',
        `${invalidSummaryCount} invalid or duplicate architecture ${invalidSummaryCount === 1 ? 'summary was' : 'summaries were'} ignored. The underlying storage entries were left untouched.`,
        { count: invalidSummaryCount }
      )
      : null
  };
}

function enumerateEntryKeys(storage) {
  if (typeof storage.key !== 'function') {
    return { keys: [], available: false, warning: null };
  }

  const keys = [];
  try {
    const length = storage.length;
    if (!Number.isInteger(length) || length < 0) {
      return { keys: [], available: false, warning: null };
    }
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (typeof key === 'string' && key.startsWith(PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX)) {
        keys.push(key);
      }
    }
  } catch (error) {
    return {
      keys: [],
      available: false,
      warning: issue(
        'storage_enumeration_failed',
        `Graphivo could not inspect stored architecture entries: ${errorMessage(error)} The index and entries were left untouched.`
      )
    };
  }
  return { keys: [...new Set(keys)], available: true, warning: null };
}

function deserializeEntry(raw, key, expectedId, serviceCatalog, options) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      document: null,
      warning: issue(
        'library_entry_missing',
        `Architecture "${expectedId}" is listed locally but its saved document is missing. The index and other entries were left untouched.`,
        { documentId: expectedId, key }
      )
    };
  }

  try {
    const document = deserializePlanningDocument(raw, serviceCatalog, options);
    const canonicalKey = planningDocumentLibraryEntryKey(document.id);
    if ((expectedId && document.id !== expectedId) || key !== canonicalKey) {
      return {
        document: null,
        warning: issue(
          'library_entry_id_mismatch',
          `A saved architecture entry does not match its document id "${document.id}". It was ignored and left untouched; import a valid JSON export to replace it.`,
          { documentId: expectedId || document.id, key }
        )
      };
    }
    return { document, warning: null };
  } catch (error) {
    return {
      document: null,
      warning: issue(
        'library_entry_corrupt',
        `Architecture "${expectedId || key}" could not be opened: ${errorMessage(error)} The entry was ignored and left untouched; import a valid JSON export to replace it.`,
        { documentId: expectedId || undefined, key }
      )
    };
  }
}

function mutationBlockedError(state) {
  if (state.index.state === 'incompatible') {
    return new PlanningDocumentLibraryError(
      `${state.index.warning.message} Open this library with a compatible Graphivo version.`,
      'library_index_incompatible'
    );
  }
  if (state.index.state === 'corrupt' && !state.enumerationAvailable) {
    return new PlanningDocumentLibraryError(
      'The architecture library index is corrupt and this storage provider cannot enumerate entries. No changes were made; back up or export local data before repairing the index.',
      'library_index_unrecoverable'
    );
  }
  return null;
}

function readLibraryState(storage, serviceCatalog, options = {}) {
  requireReadableStorage(storage);
  const rawIndex = readItem(storage, PLANNING_DOCUMENT_LIBRARY_INDEX_KEY);
  const index = parseIndex(rawIndex);
  const enumeration = enumerateEntryKeys(storage);
  const warnings = [index.warning, enumeration.warning].filter(Boolean);
  const keys = new Map();

  for (const id of index.ids) keys.set(planningDocumentLibraryEntryKey(id), id);
  for (const key of enumeration.keys) {
    if (!keys.has(key)) keys.set(key, null);
  }

  const documents = new Map();
  let storedEntryCount = enumeration.keys.length;
  for (const [key, expectedId] of keys) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (error) {
      warnings.push(issue(
        'storage_read_failed',
        `Graphivo could not read architecture "${expectedId || key}": ${errorMessage(error)} Other readable architectures are still available.`,
        { documentId: expectedId || undefined, key }
      ));
      continue;
    }
    const result = deserializeEntry(raw, key, expectedId, serviceCatalog, options);
    if (result.warning) {
      warnings.push(result.warning);
      continue;
    }
    documents.set(result.document.id, result.document);
  }

  if (!enumeration.available) {
    storedEntryCount = index.rawDocumentCount;
  }

  const recovered = index.state === 'corrupt'
    || index.state === 'incompatible'
    || Boolean(index.warning)
    || warnings.some((warning) => warning.code.startsWith('library_entry_'))
    || documents.size !== index.ids.length;

  return {
    documents,
    index,
    warnings,
    recovered,
    enumerationAvailable: enumeration.available,
    storedEntryCount
  };
}

function publicListing(state) {
  return {
    summaries: orderSummaries([...state.documents.values()].map(summaryFromDocument)),
    warnings: state.warnings,
    recovered: state.recovered
  };
}

export function listPlanningDocuments(storage, serviceCatalog, options = {}) {
  try {
    return publicListing(readLibraryState(storage, serviceCatalog, options));
  } catch (error) {
    const libraryError = error instanceof PlanningDocumentLibraryError
      ? error
      : new PlanningDocumentLibraryError(errorMessage(error));
    return {
      summaries: [],
      warnings: [issue(libraryError.code, libraryError.message)],
      recovered: false
    };
  }
}

export function loadPlanningDocumentFromLibrary(
  storage,
  documentId,
  serviceCatalog,
  options = {}
) {
  let id;
  try {
    id = validDocumentId(documentId);
    requireReadableStorage(storage);
    const key = planningDocumentLibraryEntryKey(id);
    const raw = readItem(storage, key);
    if (raw == null) return { document: null, found: false, error: null };
    const result = deserializeEntry(raw, key, id, serviceCatalog, options);
    return result.warning
      ? { document: null, found: true, error: result.warning }
      : { document: result.document, found: true, error: null };
  } catch (error) {
    const libraryError = error instanceof PlanningDocumentLibraryError
      ? error
      : new PlanningDocumentLibraryError(errorMessage(error));
    return {
      document: null,
      found: false,
      error: issue(libraryError.code, libraryError.message, id ? { documentId: id } : {})
    };
  }
}

export function upsertPlanningDocument(
  storage,
  document,
  serviceCatalog,
  options = {}
) {
  requireWritableStorage(storage, { remove: true });
  const state = readLibraryState(storage, serviceCatalog, options);
  const blocked = mutationBlockedError(state);
  if (blocked) throw blocked;

  let normalized;
  try {
    const candidate = options.preserveUpdatedAt
      ? document
      : touchPlanningDocument(document, options.now || new Date().toISOString());
    normalized = normalizePlanningDocument(candidate, serviceCatalog, options);
  } catch (error) {
    if (error instanceof PlanningDocumentError) throw error;
    throw new PlanningDocumentLibraryError(
      `The architecture could not be prepared for local saving: ${errorMessage(error)}`,
      'invalid_document'
    );
  }

  const entryKey = planningDocumentLibraryEntryKey(normalized.id);
  const previousEntry = readItem(storage, entryKey);
  const nextDocuments = new Map(state.documents);
  nextDocuments.set(normalized.id, normalized);
  const nextIndex = indexFromDocuments(nextDocuments);

  writeItem(storage, entryKey, JSON.stringify(normalized));
  try {
    writeItem(storage, PLANNING_DOCUMENT_LIBRARY_INDEX_KEY, JSON.stringify(nextIndex));
  } catch (error) {
    try {
      if (previousEntry == null) removeItem(storage, entryKey);
      else writeItem(storage, entryKey, previousEntry);
    } catch (rollbackError) {
      throw new PlanningDocumentLibraryError(
        `${error.message} The entry rollback also failed: ${rollbackError.message} Reload the library and export any readable architectures before trying again.`,
        'storage_write_failed_rollback_failed',
        { documentId: normalized.id }
      );
    }
    throw error;
  }

  return {
    document: normalized,
    summaries: nextIndex.documents,
    warnings: state.warnings
  };
}

export function deletePlanningDocumentFromLibrary(
  storage,
  documentId,
  serviceCatalog,
  options = {}
) {
  requireWritableStorage(storage, { remove: true });
  const id = validDocumentId(documentId);
  const state = readLibraryState(storage, serviceCatalog, options);
  const blocked = mutationBlockedError(state);
  if (blocked) throw blocked;

  const entryKey = planningDocumentLibraryEntryKey(id);
  const previousEntry = readItem(storage, entryKey);
  const wasIndexed = state.documents.has(id)
    || state.index.ids.includes(id);
  if (previousEntry == null && !wasIndexed) {
    return { deleted: false, summaries: publicListing(state).summaries, warnings: state.warnings };
  }

  const nextDocuments = new Map(state.documents);
  nextDocuments.delete(id);
  const nextIndex = indexFromDocuments(nextDocuments);

  if (previousEntry != null) removeItem(storage, entryKey);
  try {
    writeItem(storage, PLANNING_DOCUMENT_LIBRARY_INDEX_KEY, JSON.stringify(nextIndex));
  } catch (error) {
    if (previousEntry != null) {
      try {
        writeItem(storage, entryKey, previousEntry);
      } catch (rollbackError) {
        throw new PlanningDocumentLibraryError(
          `${error.message} The deleted entry could not be restored: ${rollbackError.message} Other storage keys were not changed.`,
          'storage_delete_rollback_failed',
          { documentId: id }
        );
      }
    }
    throw error;
  }

  return {
    deleted: true,
    summaries: nextIndex.documents,
    warnings: state.warnings
  };
}

export function initializePlanningDocumentLibrary(
  storage,
  serviceCatalog,
  options = {}
) {
  let state;
  try {
    state = readLibraryState(storage, serviceCatalog, options);
  } catch (error) {
    const listing = listPlanningDocuments(storage, serviceCatalog, options);
    return { ...listing, migrated: false, migratedDocumentId: null };
  }

  const listing = publicListing(state);
  const libraryIsEmpty = state.documents.size === 0
    && state.storedEntryCount === 0
    && state.index.rawDocumentCount === 0
    && state.index.state !== 'corrupt'
    && state.index.state !== 'incompatible';
  if (!libraryIsEmpty) {
    return { ...listing, migrated: false, migratedDocumentId: null };
  }

  let legacyRaw;
  try {
    legacyRaw = storage.getItem(PLANNING_DOCUMENT_STORAGE_KEY);
  } catch (error) {
    return {
      ...listing,
      migrated: false,
      migratedDocumentId: null,
      warnings: [
        ...listing.warnings,
        issue(
          'legacy_storage_read_failed',
          `Graphivo could not read the previous last-architecture save: ${errorMessage(error)} It was left untouched.`
        )
      ]
    };
  }

  if (legacyRaw == null) {
    return { ...listing, migrated: false, migratedDocumentId: null };
  }

  let legacyDocument;
  try {
    legacyDocument = deserializePlanningDocument(legacyRaw, serviceCatalog, options);
  } catch (error) {
    return {
      ...listing,
      migrated: false,
      migratedDocumentId: null,
      warnings: [
        ...listing.warnings,
        issue(
          'legacy_document_corrupt',
          `The previous last-architecture save could not be imported: ${errorMessage(error)} It was left untouched; import a valid JSON export to recover it.`
        )
      ]
    };
  }

  try {
    const saved = upsertPlanningDocument(storage, legacyDocument, serviceCatalog, {
      ...options,
      preserveUpdatedAt: true
    });
    return {
      summaries: saved.summaries,
      warnings: [...listing.warnings, ...saved.warnings],
      recovered: listing.recovered,
      migrated: true,
      migratedDocumentId: saved.document.id
    };
  } catch (error) {
    return {
      ...listing,
      migrated: false,
      migratedDocumentId: null,
      warnings: [
        ...listing.warnings,
        issue(
          error.code || 'legacy_migration_failed',
          `The previous last-architecture save could not be added to the library: ${errorMessage(error)} The original save was left untouched.`
        )
      ]
    };
  }
}
