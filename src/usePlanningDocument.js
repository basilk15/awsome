import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPlanningDocument,
  deserializePlanningDocument,
  hasPlanningWork,
  loadPlanningDocument,
  planningDocumentFingerprint,
  savePlanningDocument,
  serializePlanningDocument,
  touchPlanningDocument
} from './planningDocument.mjs';
import {
  canRedoPlanningHistory,
  canUndoPlanningHistory,
  createPlanningHistory,
  recordPlanningHistory,
  redoPlanningHistory,
  resetPlanningHistory,
  undoPlanningHistory
} from './planning/history.mjs';
import {
  deletePlanningDocumentFromLibrary,
  initializePlanningDocumentLibrary,
  loadPlanningDocumentFromLibrary,
  upsertPlanningDocument
} from './planning/documentLibrary.mjs';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeFileName(name) {
  const normalized = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ');
  return `${normalized || 'graphivo-architecture'}.graphivo.json`;
}

function downloadJson(json, name) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(name);
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function usePlanningDocument(serviceCatalog) {
  const storageRef = useRef(browserStorage());
  const initialLoadRef = useRef(null);
  if (!initialLoadRef.current) {
    initialLoadRef.current = loadPlanningDocument(storageRef.current, serviceCatalog);
  }

  const initialLoad = initialLoadRef.current;
  const initialLibraryRef = useRef(null);
  if (!initialLibraryRef.current) {
    initialLibraryRef.current = initializePlanningDocumentLibrary(storageRef.current, serviceCatalog);
  }
  const initialLibrary = initialLibraryRef.current;
  const [planningDocument, setPlanningDocument] = useState(initialLoad.document);
  const [feedback, setFeedback] = useState(() => {
    if (initialLoad.error) return { type: 'error', text: initialLoad.error };
    if (initialLibrary.warnings?.length) return { type: 'error', text: initialLibrary.warnings[0].message };
    if (initialLoad.restored) return { type: 'success', text: `Restored “${initialLoad.document.name}” from this device.` };
    return null;
  });
  const [lastSavedAt, setLastSavedAt] = useState(initialLoad.restored ? initialLoad.document.updatedAt : null);
  const [librarySummaries, setLibrarySummaries] = useState(initialLibrary.summaries || []);
  const [, setHistoryVersion] = useState(0);
  const latestDocumentRef = useRef(planningDocument);
  const lastSavedFingerprintRef = useRef(planningDocumentFingerprint(planningDocument));
  const dirtyRef = useRef(false);
  const historyRef = useRef(createPlanningHistory(planningDocument));
  const replayedFingerprintRef = useRef(null);
  const lastLibrarySaveSucceededRef = useRef(true);

  latestDocumentRef.current = planningDocument;

  const persistDocument = useCallback((candidate, report = true) => {
    try {
      const saved = savePlanningDocument(storageRef.current, candidate, serviceCatalog);
      let libraryError = null;
      try {
        const libraryResult = upsertPlanningDocument(
          storageRef.current,
          saved,
          serviceCatalog,
          { preserveUpdatedAt: true }
        );
        setLibrarySummaries(libraryResult.summaries);
        lastLibrarySaveSucceededRef.current = true;
      } catch (error) {
        libraryError = error;
        lastLibrarySaveSucceededRef.current = false;
      }
      lastSavedFingerprintRef.current = planningDocumentFingerprint(saved);
      dirtyRef.current = false;
      if (report) {
        setLastSavedAt(saved.updatedAt);
        setFeedback(libraryError
          ? { type: 'error', text: `The active architecture was saved, but the library could not be updated: ${libraryError.message}` }
          : { type: 'success', text: 'Saved locally on this device.' });
      }
      return saved;
    } catch (error) {
      if (report) setFeedback({ type: 'error', text: error.message });
      return null;
    }
  }, [serviceCatalog]);

  useEffect(() => {
    const fingerprint = planningDocumentFingerprint(planningDocument);
    dirtyRef.current = fingerprint !== lastSavedFingerprintRef.current;
    if (!dirtyRef.current) return undefined;

    setFeedback({ type: 'info', text: 'Saving changes…' });
    const timer = window.setTimeout(() => {
      const fingerprint = planningDocumentFingerprint(planningDocument);
      if (replayedFingerprintRef.current === fingerprint) {
        replayedFingerprintRef.current = null;
      } else {
        const nextHistory = recordPlanningHistory(historyRef.current, planningDocument);
        if (nextHistory !== historyRef.current) {
          historyRef.current = nextHistory;
          setHistoryVersion((version) => version + 1);
        }
        replayedFingerprintRef.current = null;
      }
      persistDocument(planningDocument);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [persistDocument, planningDocument]);

  useEffect(() => () => {
    if (dirtyRef.current) persistDocument(latestDocumentRef.current, false);
  }, [persistDocument]);

  const updateDocument = useCallback((updater) => {
    setPlanningDocument((current) => typeof updater === 'function' ? updater(current) : updater);
  }, []);

  const setNodes = useCallback((updater) => {
    updateDocument((current) => ({
      ...current,
      nodes: typeof updater === 'function' ? updater(current.nodes) : updater
    }));
  }, [updateDocument]);

  const setEdges = useCallback((updater) => {
    updateDocument((current) => ({
      ...current,
      edges: typeof updater === 'function' ? updater(current.edges) : updater
    }));
  }, [updateDocument]);

  const setCanvasZoom = useCallback((updater) => {
    updateDocument((current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        zoom: typeof updater === 'function' ? updater(current.viewport.zoom) : updater
      }
    }));
  }, [updateDocument]);

  const setCanvasPan = useCallback((updater) => {
    updateDocument((current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        pan: typeof updater === 'function' ? updater(current.viewport.pan) : updater
      }
    }));
  }, [updateDocument]);

  const renameDocument = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', text: 'Architecture name cannot be empty.' });
      return false;
    }
    updateDocument((current) => ({ ...current, name: trimmed.slice(0, 120) }));
    return true;
  }, [updateDocument]);

  const replaceAndSave = useCallback((nextDocument, successMessage) => {
    const saved = persistDocument(nextDocument, false);
    const next = saved || nextDocument;
    const fullySaved = Boolean(saved && lastLibrarySaveSucceededRef.current);
    if (saved) lastSavedFingerprintRef.current = planningDocumentFingerprint(saved);
    dirtyRef.current = !saved;
    historyRef.current = resetPlanningHistory(historyRef.current, next);
    replayedFingerprintRef.current = null;
    setPlanningDocument(next);
    setHistoryVersion((version) => version + 1);
    setLastSavedAt(saved?.updatedAt || null);
    setFeedback(fullySaved
      ? { type: 'success', text: successMessage }
      : { type: 'error', text: 'The architecture is open, but it could not be saved to the local library. Export it as JSON to keep a copy.' });
  }, [persistDocument]);

  const undo = useCallback(() => {
    let history = recordPlanningHistory(historyRef.current, latestDocumentRef.current);
    history = undoPlanningHistory(history);
    if (history === historyRef.current) return false;
    historyRef.current = history;
    replayedFingerprintRef.current = planningDocumentFingerprint(history.present);
    setPlanningDocument(history.present);
    setHistoryVersion((version) => version + 1);
    setFeedback({ type: 'info', text: 'Undid the last planning change.' });
    return true;
  }, []);

  const redo = useCallback(() => {
    const history = redoPlanningHistory(historyRef.current);
    if (history === historyRef.current) return false;
    historyRef.current = history;
    replayedFingerprintRef.current = planningDocumentFingerprint(history.present);
    setPlanningDocument(history.present);
    setHistoryVersion((version) => version + 1);
    setFeedback({ type: 'info', text: 'Redid the planning change.' });
    return true;
  }, []);

  const createNewArchitecture = useCallback(() => {
    if (hasPlanningWork(latestDocumentRef.current)) {
      const saved = persistDocument(latestDocumentRef.current, false);
      if (!saved || !lastLibrarySaveSucceededRef.current) {
        setFeedback({ type: 'error', text: 'The current architecture could not be added to the library. Export it before starting another architecture.' });
        return false;
      }
    }
    replaceAndSave(createPlanningDocument(), 'New architecture created and saved locally.');
    return true;
  }, [persistDocument, replaceAndSave]);

  const importArchitecture = useCallback((text, fileName = 'selected file') => {
    let imported;
    try {
      imported = deserializePlanningDocument(text, serviceCatalog);
    } catch (error) {
      setFeedback({ type: 'error', text: `Could not import ${fileName}: ${error.message}` });
      return false;
    }
    const existing = librarySummaries.find((summary) => summary.id === imported.id);
    if (existing && !window.confirm(`Importing will replace the saved architecture “${existing.name}”. Continue?`)) {
      return false;
    }
    if (hasPlanningWork(latestDocumentRef.current)) {
      const saved = persistDocument(latestDocumentRef.current, false);
      if (!saved || !lastLibrarySaveSucceededRef.current) {
        setFeedback({ type: 'error', text: 'The current architecture could not be added to the library. Export it before importing another architecture.' });
        return false;
      }
    }
    replaceAndSave(imported, `Imported “${imported.name}” and saved it locally.`);
    return true;
  }, [librarySummaries, persistDocument, replaceAndSave, serviceCatalog]);

  const openArchitecture = useCallback((documentId) => {
    if (documentId === latestDocumentRef.current.id) return true;
    if (hasPlanningWork(latestDocumentRef.current)) {
      const saved = persistDocument(latestDocumentRef.current, false);
      if (!saved || !lastLibrarySaveSucceededRef.current) {
        setFeedback({ type: 'error', text: 'The current architecture could not be added to the library. Export it before switching documents.' });
        return false;
      }
    }
    const loaded = loadPlanningDocumentFromLibrary(storageRef.current, documentId, serviceCatalog);
    if (!loaded.document) {
      setFeedback({
        type: 'error',
        text: loaded.error?.message || 'The selected architecture is no longer available in local storage.'
      });
      return false;
    }
    replaceAndSave(loaded.document, `Opened “${loaded.document.name}”.`);
    return true;
  }, [persistDocument, replaceAndSave, serviceCatalog]);

  const deleteArchitecture = useCallback((documentId) => {
    const summary = librarySummaries.find((item) => item.id === documentId);
    if (!summary) return false;
    if (!window.confirm(`Delete “${summary.name}” from this device? This cannot be undone unless you exported a copy.`)) {
      return false;
    }

    try {
      const result = deletePlanningDocumentFromLibrary(
        storageRef.current,
        documentId,
        serviceCatalog
      );
      setLibrarySummaries(result.summaries);
      if (!result.deleted) return false;

      if (documentId === latestDocumentRef.current.id) {
        const nextSummary = result.summaries[0];
        const loaded = nextSummary
          ? loadPlanningDocumentFromLibrary(storageRef.current, nextSummary.id, serviceCatalog)
          : null;
        replaceAndSave(
          loaded?.document || createPlanningDocument(),
          nextSummary ? `Deleted “${summary.name}” and opened “${nextSummary.name}”.` : `Deleted “${summary.name}” and created a blank architecture.`
        );
      } else {
        setFeedback({ type: 'success', text: `Deleted “${summary.name}” from this device.` });
      }
      return true;
    } catch (error) {
      setFeedback({ type: 'error', text: `Could not delete “${summary.name}”: ${error.message}` });
      return false;
    }
  }, [librarySummaries, replaceAndSave, serviceCatalog]);

  const exportArchitecture = useCallback(() => {
    const current = latestDocumentRef.current;
    const saved = persistDocument(current, false);
    const exportable = saved || touchPlanningDocument(current);
    try {
      const json = serializePlanningDocument(exportable, serviceCatalog);
      downloadJson(json, exportable.name);
      if (saved) {
        setLastSavedAt(saved.updatedAt);
        setFeedback({ type: 'success', text: 'Architecture exported as JSON and saved locally.' });
      } else {
        setFeedback({ type: 'info', text: 'Architecture exported as JSON. Local saving remains unavailable.' });
      }
      return true;
    } catch (error) {
      setFeedback({ type: 'error', text: `Could not export the architecture: ${error.message}` });
      return false;
    }
  }, [persistDocument, serviceCatalog]);

  return {
    planningDocument,
    nodes: planningDocument.nodes,
    edges: planningDocument.edges,
    canvasZoom: planningDocument.viewport.zoom,
    canvasPan: planningDocument.viewport.pan,
    feedback,
    lastSavedAt,
    setNodes,
    setEdges,
    setCanvasZoom,
    setCanvasPan,
    renameDocument,
    createNewArchitecture,
    importArchitecture,
    exportArchitecture,
    librarySummaries,
    openArchitecture,
    deleteArchitecture,
    undo,
    redo,
    canUndo: canUndoPlanningHistory(historyRef.current)
      || planningDocumentFingerprint(planningDocument) !== planningDocumentFingerprint(historyRef.current.present),
    canRedo: canRedoPlanningHistory(historyRef.current)
  };
}
