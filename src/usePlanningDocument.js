import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPlanningDocument,
  deserializePlanningDocument,
  hasPlanningWork,
  loadPlanningDocument,
  planningDocumentFingerprint,
  planningTopologyFingerprint,
  savePlanningDocument,
  serializePlanningDocument,
  touchPlanningDocument
} from './planningDocument.mjs';
import {
  canRedoPlanningHistory,
  canUndoPlanningHistory,
  createPlanningHistory,
  hasPlanningHistoryEdit,
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
import { readTerraformPlan } from './planning/terraformPlan.mjs';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeFileName(name) {
  const normalized = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ');
  return `${normalized || 'awsome-architecture'}.awsome.json`;
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
  const { id: documentId, name: documentName, nodes, edges } = planningDocument;
  const [feedback, setFeedback] = useState(() => {
    if (initialLoad.error) return { type: 'error', text: initialLoad.error };
    if (initialLibrary.warnings?.length) return { type: 'error', text: initialLibrary.warnings[0].message };
    if (initialLoad.restored) return { type: 'success', text: `Restored “${initialLoad.document.name}” from this device.` };
    return null;
  });
  const [lastSavedAt, setLastSavedAt] = useState(initialLoad.restored ? initialLoad.document.updatedAt : null);
  const [saveIssue, setSaveIssue] = useState(null);
  const [librarySummaries, setLibrarySummaries] = useState(initialLibrary.summaries || []);
  const [, setHistoryVersion] = useState(0);
  const latestDocumentRef = useRef(planningDocument);
  const lastSavedDocumentIdRef = useRef(initialLoad.restored ? initialLoad.document.id : null);
  const lastSavedFingerprintRef = useRef(planningDocumentFingerprint(planningDocument));
  const lastSavedTopologyFingerprintRef = useRef(planningTopologyFingerprint(planningDocument));
  const historyRef = useRef(createPlanningHistory(planningDocument));
  const lastLibrarySaveSucceededRef = useRef(true);

  latestDocumentRef.current = planningDocument;

  const persistDocument = useCallback((candidate, report = true, reportErrors = report) => {
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
      lastSavedDocumentIdRef.current = saved.id;
      lastSavedFingerprintRef.current = planningDocumentFingerprint(saved);
      lastSavedTopologyFingerprintRef.current = planningTopologyFingerprint(saved);
      setSaveIssue(libraryError ? 'Library save failed' : null);
      if (report || reportErrors) {
        setLastSavedAt(saved.updatedAt);
        if (libraryError) setFeedback({ type: 'error', text: `The active architecture was saved, but the library could not be updated: ${libraryError.message}` });
        else if (report) setFeedback({ type: 'success', text: 'Saved locally on this device.' });
      }
      return saved;
    } catch (error) {
      setSaveIssue('Unsaved changes');
      if (reportErrors) setFeedback({ type: 'error', text: error.message });
      return null;
    }
  }, [serviceCatalog]);

  useEffect(() => {
    const needsSave = planningDocumentFingerprint(planningDocument) !== lastSavedFingerprintRef.current;
    const topologyChanged = planningTopologyFingerprint(planningDocument) !== lastSavedTopologyFingerprintRef.current;
    if (!needsSave || !topologyChanged) {
      setFeedback((current) => current?.text === 'Saving changes…' ? null : current);
    }
    if (!needsSave) return undefined;

    if (topologyChanged) setFeedback({ type: 'info', text: 'Saving changes…' });
    const timer = window.setTimeout(() => {
      if (latestDocumentRef.current.id === planningDocument.id) {
        persistDocument(planningDocument, topologyChanged, true);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [persistDocument, planningDocument]);

  useEffect(() => {
    if (!hasPlanningHistoryEdit(historyRef.current, latestDocumentRef.current)) return undefined;
    const timer = window.setTimeout(() => {
      const nextHistory = recordPlanningHistory(historyRef.current, latestDocumentRef.current);
      if (nextHistory !== historyRef.current) {
        historyRef.current = nextHistory;
        setHistoryVersion((version) => version + 1);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [documentId, documentName, nodes, edges]);

  useEffect(() => {
    const flushPendingSave = () => {
      const current = latestDocumentRef.current;
      if (planningDocumentFingerprint(current) !== lastSavedFingerprintRef.current) {
        persistDocument(current, false);
      }
    };
    window.addEventListener('pagehide', flushPendingSave);
    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      flushPendingSave();
    };
  }, [persistDocument]);

  const updateDocument = useCallback((updater) => {
    setPlanningDocument((current) => typeof updater === 'function' ? updater(current) : updater);
  }, []);

  const setNodes = useCallback((updater, { recordPriorState = false } = {}) => {
    if (recordPriorState) {
      historyRef.current = recordPlanningHistory(historyRef.current, latestDocumentRef.current);
    }
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

  const openDocument = useCallback((document, savedAt, feedback) => {
    latestDocumentRef.current = document;
    historyRef.current = resetPlanningHistory(historyRef.current, document);
    setPlanningDocument(document);
    setHistoryVersion((version) => version + 1);
    setLastSavedAt(savedAt);
    setFeedback(feedback);
  }, []);

  const replaceAndSave = useCallback((nextDocument, successMessage) => {
    const saved = persistDocument(nextDocument, false);
    const fullySaved = Boolean(saved && lastLibrarySaveSucceededRef.current);
    openDocument(saved || nextDocument, saved?.updatedAt || null, fullySaved
      ? { type: 'success', text: successMessage }
      : { type: 'error', text: 'The architecture is open, but it could not be saved to the local library. Export it as JSON to keep a copy.' });
  }, [openDocument, persistDocument]);

  const undo = useCallback(() => {
    const current = latestDocumentRef.current;
    const history = undoPlanningHistory(recordPlanningHistory(historyRef.current, current));
    if (history === historyRef.current) return false;
    historyRef.current = history;
    setPlanningDocument({ ...history.present, viewport: current.viewport });
    setHistoryVersion((version) => version + 1);
    setFeedback({ type: 'info', text: 'Undid the last planning change.' });
    return true;
  }, []);

  const redo = useCallback(() => {
    const current = latestDocumentRef.current;
    if (hasPlanningHistoryEdit(historyRef.current, current)) return false;
    const history = redoPlanningHistory(historyRef.current);
    if (history === historyRef.current) return false;
    historyRef.current = history;
    setPlanningDocument({ ...history.present, viewport: current.viewport });
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

  const createArchitectureFromGraph = useCallback(({ nodes, edges }, name, successMessage) => {
    const current = latestDocumentRef.current;
    const { document: libraryCopy } = loadPlanningDocumentFromLibrary(storageRef.current, current.id, serviceCatalog);
    const currentFingerprint = planningDocumentFingerprint(current);
    const preserveCurrent = libraryCopy || lastSavedDocumentIdRef.current === current.id || hasPlanningWork(current);
    const currentNeedsSave = !libraryCopy || currentFingerprint !== planningDocumentFingerprint(libraryCopy)
      || currentFingerprint !== lastSavedFingerprintRef.current;
    if (preserveCurrent && currentNeedsSave) {
      const saved = persistDocument(current, false, true);
      if (!saved || !lastLibrarySaveSucceededRef.current) {
        throw new Error('Could not save the current architecture to the library. Export it from Planning as JSON.');
      }
    }

    const candidate = { ...createPlanningDocument({ name: name.slice(0, 120).trimEnd() }), nodes, edges };
    const { document, summaries } = upsertPlanningDocument(storageRef.current, candidate, serviceCatalog, {
      activateNew: true
    });
    lastSavedDocumentIdRef.current = document.id;
    lastSavedFingerprintRef.current = planningDocumentFingerprint(document);
    lastSavedTopologyFingerprintRef.current = planningTopologyFingerprint(document);
    lastLibrarySaveSucceededRef.current = true;
    setSaveIssue(null);
    setLibrarySummaries(summaries);
    openDocument(document, document.updatedAt, { type: 'success', text: successMessage || `Created “${document.name}” and saved it locally.` });
  }, [openDocument, persistDocument, serviceCatalog]);

  const importArchitecture = useCallback((text, fileName = 'selected file') => {
    let imported;
    try {
      const terraform = readTerraformPlan(text, fileName);
      if (terraform) {
        const { name, nodes, edges, skippedResources, incomplete } = terraform;
        const message = [
          `Imported ${nodes.length} ${nodes.length === 1 ? 'service' : 'services'} and ${edges.length} ${edges.length === 1 ? 'connection' : 'connections'} as “${name}”.`,
          skippedResources ? `Skipped ${skippedResources} unsupported AWS ${skippedResources === 1 ? 'resource' : 'resources'}.` : '',
          incomplete ? 'Terraform marked this plan incomplete.' : ''
        ].filter(Boolean).join(' ');
        createArchitectureFromGraph(terraform, name, message);
        return true;
      }
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
  }, [createArchitectureFromGraph, librarySummaries, persistDocument, replaceAndSave, serviceCatalog]);

  const exportArchitecture = useCallback(() => {
    const current = latestDocumentRef.current;
    const saved = persistDocument(current, false);
    const exportable = saved || touchPlanningDocument(current);
    try {
      const json = serializePlanningDocument(exportable, serviceCatalog);
      downloadJson(json, exportable.name);
      if (saved) {
        setLastSavedAt(saved.updatedAt);
        setFeedback(lastLibrarySaveSucceededRef.current
          ? { type: 'success', text: 'Architecture exported as JSON and saved locally.' }
          : { type: 'error', text: 'Architecture exported as JSON. The local library could not be updated.' });
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
    nodes,
    edges,
    canvasZoom: planningDocument.viewport.zoom,
    canvasPan: planningDocument.viewport.pan,
    feedback,
    lastSavedAt,
    saveIssue,
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
    createArchitectureFromGraph,
    undo,
    redo,
    canUndo: canUndoPlanningHistory(historyRef.current) || hasPlanningHistoryEdit(historyRef.current, planningDocument),
    canRedo: canRedoPlanningHistory(historyRef.current) && !hasPlanningHistoryEdit(historyRef.current, planningDocument)
  };
}
