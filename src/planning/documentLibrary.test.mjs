import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLANNING_DOCUMENT_STORAGE_KEY,
  createPlanningDocument
} from '../planningDocument.mjs';
import {
  PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX,
  PLANNING_DOCUMENT_LIBRARY_INDEX_KEY,
  PLANNING_DOCUMENT_LIBRARY_SCHEMA,
  PLANNING_DOCUMENT_LIBRARY_VERSION,
  deletePlanningDocumentFromLibrary,
  initializePlanningDocumentLibrary,
  listPlanningDocuments,
  loadPlanningDocumentFromLibrary,
  planningDocumentLibraryEntryKey,
  upsertPlanningDocument
} from './documentLibrary.mjs';

const catalog = [
  { key: 'ec2', name: 'Amazon EC2' },
  { key: 's3', name: 'Amazon S3' }
];
const firstTime = '2026-07-28T10:00:00.000Z';
const secondTime = '2026-07-29T10:00:00.000Z';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.failGet = new Set();
    this.failSet = new Set();
    this.failRemove = new Set();
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    if (this.failGet.has(key)) throw new Error(`read denied for ${key}`);
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failSet.has(key)) throw new Error(`quota exceeded for ${key}`);
    this.values.set(key, String(value));
  }

  removeItem(key) {
    if (this.failRemove.has(key)) throw new Error(`delete denied for ${key}`);
    this.values.delete(key);
  }
}

function document(id, name, now, serviceKey = 'ec2') {
  return {
    ...createPlanningDocument({ id, name, now }),
    nodes: [{
      id: `${id}-node`,
      serviceKey,
      name: `${name} node`,
      x: 20,
      y: 30,
      width: 168,
      height: 84
    }]
  };
}

test('upserts separate versioned entries and lists current summaries newest first', () => {
  const storage = new MemoryStorage();
  const first = upsertPlanningDocument(storage, document('plan one', 'First', firstTime), catalog, {
    now: firstTime
  });
  const second = upsertPlanningDocument(storage, document('plan/two', 'Second', secondTime), catalog, {
    now: secondTime
  });

  assert.equal(first.document.updatedAt, firstTime);
  assert.equal(storage.getItem(PLANNING_DOCUMENT_STORAGE_KEY), null);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('plan one')) != null, true);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('plan/two')) != null, true);

  const index = JSON.parse(storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY));
  assert.equal(index.schema, PLANNING_DOCUMENT_LIBRARY_SCHEMA);
  assert.equal(index.version, PLANNING_DOCUMENT_LIBRARY_VERSION);
  assert.deepEqual(index.documents.map(({ id }) => id), ['plan/two', 'plan one']);

  const listing = listPlanningDocuments(storage, catalog);
  assert.equal(listing.warnings.length, 0);
  assert.equal(listing.recovered, false);
  assert.deepEqual(listing.summaries, [
    {
      id: 'plan/two',
      name: 'Second',
      createdAt: secondTime,
      updatedAt: secondTime,
      nodeCount: 1,
      edgeCount: 0
    },
    {
      id: 'plan one',
      name: 'First',
      createdAt: firstTime,
      updatedAt: firstTime,
      nodeCount: 1,
      edgeCount: 0
    }
  ]);
});

test('a fresh empty library is not reported as a recovery', () => {
  assert.deepEqual(listPlanningDocuments(new MemoryStorage(), catalog), {
    summaries: [],
    warnings: [],
    recovered: false
  });
});

test('upsert replaces one document without touching sibling entries or unrelated storage', () => {
  const storage = new MemoryStorage({ unrelated: 'keep me' });
  upsertPlanningDocument(storage, document('one', 'One', firstTime), catalog, { now: firstTime });
  upsertPlanningDocument(storage, document('two', 'Two', firstTime), catalog, { now: firstTime });
  const siblingBefore = storage.getItem(planningDocumentLibraryEntryKey('two'));

  const updated = {
    ...document('one', 'One revised', firstTime, 's3'),
    createdAt: firstTime
  };
  upsertPlanningDocument(storage, updated, catalog, { now: secondTime });

  assert.equal(storage.getItem('unrelated'), 'keep me');
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('two')), siblingBefore);
  const loaded = loadPlanningDocumentFromLibrary(storage, 'one', catalog);
  assert.equal(loaded.found, true);
  assert.equal(loaded.error, null);
  assert.equal(loaded.document.name, 'One revised');
  assert.equal(loaded.document.updatedAt, secondTime);
  assert.equal(loaded.document.nodes[0].serviceKey, 's3');
});

test('load reports missing and corrupt entries without mutating either one', () => {
  const corruptKey = planningDocumentLibraryEntryKey('broken');
  const storage = new MemoryStorage({ [corruptKey]: '{nope' });

  assert.deepEqual(
    loadPlanningDocumentFromLibrary(storage, 'missing', catalog),
    { document: null, found: false, error: null }
  );
  const corrupt = loadPlanningDocumentFromLibrary(storage, 'broken', catalog);
  assert.equal(corrupt.found, true);
  assert.equal(corrupt.document, null);
  assert.equal(corrupt.error.code, 'library_entry_corrupt');
  assert.match(corrupt.error.message, /not valid JSON.*left untouched.*valid JSON export/is);
  assert.equal(storage.getItem(corruptKey), '{nope');
});

test('delete removes only the selected entry and updates the index', () => {
  const storage = new MemoryStorage({ 'unrelated.preference': 'dark' });
  upsertPlanningDocument(storage, document('one', 'One', firstTime), catalog, { now: firstTime });
  upsertPlanningDocument(storage, document('two', 'Two', secondTime), catalog, { now: secondTime });
  const secondEntry = storage.getItem(planningDocumentLibraryEntryKey('two'));

  const result = deletePlanningDocumentFromLibrary(storage, 'one', catalog);
  assert.equal(result.deleted, true);
  assert.deepEqual(result.summaries.map(({ id }) => id), ['two']);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('one')), null);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('two')), secondEntry);
  assert.equal(storage.getItem('unrelated.preference'), 'dark');
  assert.equal(deletePlanningDocumentFromLibrary(storage, 'missing', catalog).deleted, false);
});

test('initialization imports the legacy last document only into an empty library and preserves its timestamp and source', () => {
  const legacy = document('legacy', 'Existing draft', firstTime);
  const legacyJson = JSON.stringify(legacy);
  const storage = new MemoryStorage({ [PLANNING_DOCUMENT_STORAGE_KEY]: legacyJson });

  const result = initializePlanningDocumentLibrary(storage, catalog, { now: secondTime });
  assert.equal(result.migrated, true);
  assert.equal(result.migratedDocumentId, 'legacy');
  assert.equal(result.summaries[0].updatedAt, firstTime);
  assert.equal(storage.getItem(PLANNING_DOCUMENT_STORAGE_KEY), legacyJson);
  assert.equal(
    JSON.parse(storage.getItem(planningDocumentLibraryEntryKey('legacy'))).updatedAt,
    firstTime
  );

  const again = initializePlanningDocumentLibrary(storage, catalog, { now: secondTime });
  assert.equal(again.migrated, false);
  assert.deepEqual(again.summaries.map(({ id }) => id), ['legacy']);
});

test('initialization does not import legacy data over an existing library', () => {
  const storage = new MemoryStorage({
    [PLANNING_DOCUMENT_STORAGE_KEY]: JSON.stringify(document('legacy', 'Legacy', firstTime))
  });
  upsertPlanningDocument(storage, document('current', 'Current', secondTime), catalog, {
    now: secondTime
  });

  const result = initializePlanningDocumentLibrary(storage, catalog);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.summaries.map(({ id }) => id), ['current']);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('legacy')), null);
});

test('initialization does not overwrite a non-empty index whose entry is missing', () => {
  const legacyJson = JSON.stringify(document('legacy', 'Legacy', firstTime));
  const originalIndex = JSON.stringify({
    schema: PLANNING_DOCUMENT_LIBRARY_SCHEMA,
    version: PLANNING_DOCUMENT_LIBRARY_VERSION,
    documents: [{
      id: 'temporarily-missing',
      name: 'Temporarily missing',
      createdAt: firstTime,
      updatedAt: firstTime,
      nodeCount: 0,
      edgeCount: 0
    }]
  });
  const storage = new MemoryStorage({
    [PLANNING_DOCUMENT_STORAGE_KEY]: legacyJson,
    [PLANNING_DOCUMENT_LIBRARY_INDEX_KEY]: originalIndex
  });

  const result = initializePlanningDocumentLibrary(storage, catalog);
  assert.equal(result.migrated, false);
  assert.equal(result.warnings[0].code, 'library_entry_missing');
  assert.equal(storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY), originalIndex);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('legacy')), null);
});

test('corrupt legacy data remains untouched and produces an actionable warning', () => {
  const storage = new MemoryStorage({ [PLANNING_DOCUMENT_STORAGE_KEY]: '{bad json' });
  const result = initializePlanningDocumentLibrary(storage, catalog);

  assert.equal(result.migrated, false);
  assert.equal(result.warnings.at(-1).code, 'legacy_document_corrupt');
  assert.match(result.warnings.at(-1).message, /could not be imported.*left untouched.*valid JSON export/is);
  assert.equal(storage.getItem(PLANNING_DOCUMENT_STORAGE_KEY), '{bad json');
  assert.equal(storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY), null);
});

test('corrupt index is recovered by scanning valid entries while corrupt entries stay isolated', () => {
  const valid = document('readable', 'Readable', firstTime);
  const validKey = planningDocumentLibraryEntryKey(valid.id);
  const badKey = `${PLANNING_DOCUMENT_LIBRARY_ENTRY_PREFIX}broken`;
  const storage = new MemoryStorage({
    [PLANNING_DOCUMENT_LIBRARY_INDEX_KEY]: '{bad index',
    [validKey]: JSON.stringify(valid),
    [badKey]: '{bad entry'
  });

  const before = Object.fromEntries(storage.values);
  const result = listPlanningDocuments(storage, catalog);
  assert.equal(result.recovered, true);
  assert.deepEqual(result.summaries.map(({ id }) => id), ['readable']);
  assert.deepEqual(
    new Set(result.warnings.map(({ code }) => code)),
    new Set(['library_index_corrupt', 'library_entry_corrupt'])
  );
  assert.deepEqual(Object.fromEntries(storage.values), before);
});

test('an orphan entry is recovered after a partial index write and included by the next upsert', () => {
  const orphan = document('orphan', 'Orphan', firstTime);
  const storage = new MemoryStorage({
    [planningDocumentLibraryEntryKey(orphan.id)]: JSON.stringify(orphan)
  });

  const listing = listPlanningDocuments(storage, catalog);
  assert.equal(listing.recovered, true);
  assert.deepEqual(listing.summaries.map(({ id }) => id), ['orphan']);

  upsertPlanningDocument(storage, document('new', 'New', secondTime), catalog, {
    now: secondTime
  });
  const index = JSON.parse(storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY));
  assert.deepEqual(index.documents.map(({ id }) => id), ['new', 'orphan']);
});

test('future library versions remain readable only by recovery and block all mutations', () => {
  const existing = document('existing', 'Existing', firstTime);
  const storage = new MemoryStorage({
    [PLANNING_DOCUMENT_LIBRARY_INDEX_KEY]: JSON.stringify({
      schema: PLANNING_DOCUMENT_LIBRARY_SCHEMA,
      version: 99,
      documents: []
    }),
    [planningDocumentLibraryEntryKey(existing.id)]: JSON.stringify(existing)
  });
  const indexBefore = storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY);

  const listing = listPlanningDocuments(storage, catalog);
  assert.deepEqual(listing.summaries.map(({ id }) => id), ['existing']);
  assert.equal(listing.warnings[0].code, 'library_index_incompatible_version');
  assert.throws(
    () => upsertPlanningDocument(storage, document('new', 'New', secondTime), catalog),
    (error) => error.code === 'library_index_incompatible'
  );
  assert.throws(
    () => deletePlanningDocumentFromLibrary(storage, 'existing', catalog),
    (error) => error.code === 'library_index_incompatible'
  );
  assert.equal(storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY), indexBefore);
});

test('unrecoverable corrupt index blocks writes when storage cannot enumerate entries', () => {
  const values = new Map([[PLANNING_DOCUMENT_LIBRARY_INDEX_KEY, '{bad']]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };

  const listing = listPlanningDocuments(storage, catalog);
  assert.equal(listing.warnings[0].code, 'library_index_corrupt');
  assert.throws(
    () => upsertPlanningDocument(storage, document('new', 'New', secondTime), catalog),
    (error) => error.code === 'library_index_unrecoverable'
  );
  assert.equal(values.get(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY), '{bad');
});

test('storage read failures are reported without throwing from read APIs', () => {
  const storage = new MemoryStorage();
  storage.failGet.add(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY);

  const listing = listPlanningDocuments(storage, catalog);
  assert.equal(listing.summaries.length, 0);
  assert.equal(listing.warnings[0].code, 'storage_read_failed');
  assert.match(listing.warnings[0].message, /could not read.*read denied/i);

  const entryKey = planningDocumentLibraryEntryKey('one');
  storage.failGet.clear();
  storage.failGet.add(entryKey);
  const loaded = loadPlanningDocumentFromLibrary(storage, 'one', catalog);
  assert.equal(loaded.error.code, 'storage_read_failed');
});

test('index write failures roll back upserts and deletion failures leave other entries intact', () => {
  const storage = new MemoryStorage({ unrelated: 'safe' });
  storage.failSet.add(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY);
  assert.throws(
    () => upsertPlanningDocument(storage, document('new', 'New', firstTime), catalog),
    (error) => error.code === 'storage_write_failed'
  );
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('new')), null);
  assert.equal(storage.getItem('unrelated'), 'safe');

  storage.failSet.clear();
  upsertPlanningDocument(storage, document('one', 'One', firstTime), catalog, { now: firstTime });
  upsertPlanningDocument(storage, document('two', 'Two', secondTime), catalog, { now: secondTime });
  const oneKey = planningDocumentLibraryEntryKey('one');
  const twoBefore = storage.getItem(planningDocumentLibraryEntryKey('two'));
  storage.failRemove.add(oneKey);
  assert.throws(
    () => deletePlanningDocumentFromLibrary(storage, 'one', catalog),
    (error) => error.code === 'storage_delete_failed'
  );
  assert.equal(storage.getItem(oneKey) != null, true);
  assert.equal(storage.getItem(planningDocumentLibraryEntryKey('two')), twoBefore);
  assert.equal(storage.getItem('unrelated'), 'safe');
});

test('an index write failure during deletion restores the selected entry', () => {
  const storage = new MemoryStorage();
  upsertPlanningDocument(storage, document('one', 'One', firstTime), catalog, { now: firstTime });
  const entryKey = planningDocumentLibraryEntryKey('one');
  const entryBefore = storage.getItem(entryKey);
  const indexBefore = storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY);
  storage.failSet.add(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY);

  assert.throws(
    () => deletePlanningDocumentFromLibrary(storage, 'one', catalog),
    (error) => error.code === 'storage_write_failed'
  );
  assert.equal(storage.getItem(entryKey), entryBefore);
  assert.equal(storage.getItem(PLANNING_DOCUMENT_LIBRARY_INDEX_KEY), indexBefore);
});
