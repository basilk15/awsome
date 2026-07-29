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
  const [planningDocument, setPlanningDocument] = useState(initialLoad.document);
  const [feedback, setFeedback] = useState(() => {
    if (initialLoad.error) return { type: 'error', text: initialLoad.error };
    if (initialLoad.restored) return { type: 'success', text: `Restored “${initialLoad.document.name}” from this device.` };
    return null;
  });
  const [lastSavedAt, setLastSavedAt] = useState(initialLoad.restored ? initialLoad.document.updatedAt : null);
  const latestDocumentRef = useRef(planningDocument);
  const lastSavedFingerprintRef = useRef(planningDocumentFingerprint(planningDocument));
  const dirtyRef = useRef(false);

  latestDocumentRef.current = planningDocument;

  const persistDocument = useCallback((candidate, report = true) => {
    try {
      const saved = savePlanningDocument(storageRef.current, candidate, serviceCatalog);
      lastSavedFingerprintRef.current = planningDocumentFingerprint(saved);
      dirtyRef.current = false;
      if (report) {
        setLastSavedAt(saved.updatedAt);
        setFeedback({ type: 'success', text: 'Saved locally on this device.' });
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
    const timer = window.setTimeout(() => persistDocument(planningDocument), 350);
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

  const confirmReplacement = useCallback((action) => (
    !hasPlanningWork(latestDocumentRef.current)
    || window.confirm(`${action} will replace “${latestDocumentRef.current.name}”. Export it first if you want to keep a separate copy. Continue?`)
  ), []);

  const replaceAndSave = useCallback((nextDocument, successMessage) => {
    const saved = persistDocument(nextDocument, false);
    const next = saved || nextDocument;
    if (saved) lastSavedFingerprintRef.current = planningDocumentFingerprint(saved);
    dirtyRef.current = !saved;
    setPlanningDocument(next);
    setLastSavedAt(saved?.updatedAt || null);
    setFeedback(saved
      ? { type: 'success', text: successMessage }
      : { type: 'error', text: 'The architecture is open, but local saving failed. Export it as JSON to keep a copy.' });
  }, [persistDocument]);

  const createNewArchitecture = useCallback(() => {
    if (!confirmReplacement('Creating a new architecture')) return false;
    replaceAndSave(createPlanningDocument(), 'New architecture created and saved locally.');
    return true;
  }, [confirmReplacement, replaceAndSave]);

  const importArchitecture = useCallback((text, fileName = 'selected file') => {
    let imported;
    try {
      imported = deserializePlanningDocument(text, serviceCatalog);
    } catch (error) {
      setFeedback({ type: 'error', text: `Could not import ${fileName}: ${error.message}` });
      return false;
    }
    if (!confirmReplacement('Importing this architecture')) return false;
    replaceAndSave(imported, `Imported “${imported.name}” and saved it locally.`);
    return true;
  }, [confirmReplacement, replaceAndSave, serviceCatalog]);

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
    exportArchitecture
  };
}
