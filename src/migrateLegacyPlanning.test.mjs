import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanningDocument, PLANNING_DOCUMENT_STORAGE_KEY } from './planningDocument.mjs';
import { planningDocumentLibraryEntryKey, listPlanningDocuments } from './planning/documentLibrary.mjs';
import { migrateLegacyPlanning } from './migrateLegacyPlanning.mjs';

const catalog = [{ key: 'ec2', name: 'Amazon EC2' }];
const date = '2026-07-28T10:00:00.000Z';
const document = (id, name) => createPlanningDocument({ id, name, now: date });

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('imports valid architectures and keeps a newer Electron entry on conflict', () => {
  const current = document('current', 'Electron copy');
  const old = document('old', 'Tauri copy');
  const target = storage({ [planningDocumentLibraryEntryKey('current')]: JSON.stringify(current) });
  const source = {
    [planningDocumentLibraryEntryKey('current')]: JSON.stringify(document('current', 'Old copy')),
    [planningDocumentLibraryEntryKey('old')]: JSON.stringify(old),
    [PLANNING_DOCUMENT_STORAGE_KEY]: JSON.stringify(old),
    'awsome.theme': 'dark'
  };
  const result = migrateLegacyPlanning(source, target, catalog);
  assert.equal(result.warnings.length, 0);
  assert.equal(JSON.parse(target.getItem(planningDocumentLibraryEntryKey('current'))).name, 'Electron copy');
  assert.equal(target.getItem('awsome.theme'), 'dark');
  assert.deepEqual(listPlanningDocuments(target, catalog).summaries.map(({ id }) => id).sort(), ['current', 'old']);
  assert.equal(migrateLegacyPlanning(source, target, catalog).imported, 0);
});

test('prior current selection cannot replace a conflicting Electron architecture', () => {
  const current = document('same', 'Electron copy');
  const target = storage({ [planningDocumentLibraryEntryKey('same')]: JSON.stringify(current) });
  migrateLegacyPlanning({ [PLANNING_DOCUMENT_STORAGE_KEY]: JSON.stringify(document('same', 'Tauri copy')) }, target, catalog);
  assert.equal(JSON.parse(target.getItem(PLANNING_DOCUMENT_STORAGE_KEY)).name, 'Electron copy');
});

test('invalid prior entries are reported without replacing current data', () => {
  const target = storage();
  const result = migrateLegacyPlanning({ [planningDocumentLibraryEntryKey('broken')]: '{bad' }, target, catalog);
  assert.equal(result.imported, 0);
  assert.equal(result.warnings.length, 1);
  assert.equal(target.getItem(planningDocumentLibraryEntryKey('broken')), null);
});
