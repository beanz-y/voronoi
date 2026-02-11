import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, Image as ImageIcon, Eraser, Brush, Eye,
  Sparkles, Download, X, RotateCcw, Undo, Redo, Trash2, Menu, Info, Github
} from 'lucide-react';
import { generateVoronoiPoints, renderCrystalLayer } from './lib/crystalizer';
import { renderComposite } from './lib/compositor';
import { generateSubjectMask } from './lib/ai-mask';
import { runBatchExport } from './lib/exporter';

function App() {
  // --- State ---
  const [imageSrc, setImageSrc] = useState(null);
  const [density, setDensity] = useState(5000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('crystals');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false)

  // Settings
  const [showBorders, setShowBorders] = useState(true);
  const [viewOriginal, setViewOriginal] = useState(false);
  const [relaxation, setRelaxation] = useState(0);
  const [detailBias, setDetailBias] = useState(0);

  // Masking
  const [currentTool, setCurrentTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(50);
  const [showMask, setShowMask] = useState(false);

  // History State
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLength, setHistoryLength] = useState(0);

  // Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOpts, setExportOpts] = useState({ bm: true, bf: true, nm: true, nf: true });
  const [exportScale, setExportScale] = useState(1);
  const [watermarkText, setWatermarkText] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Viewport
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });

  // --- Refs ---
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const crystalLayerRef = useRef(null);
  const maskLayerRef = useRef(null);
  const crystalPointsRef = useRef(null);
  const isDrawing = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const historyStack = useRef([]);

  // Touch Refs
  const lastTouchDistance = useRef(null);
  const lastTouchCenter = useRef(null);

  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // --- Global Listeners ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.matches('input, textarea')) return;

      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setIsSpaceHeld(true); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); performUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); performRedo(); }
    };
    const handleKeyUp = (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.code === "Space") { setIsSpaceHeld(false); setIsPanning(false); }
    };
    const handleGlobalPointerUp = () => {
      setIsPanning(false);
      if (isDrawing.current) {
        isDrawing.current = false;
        saveHistorySnapshot();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [historyIndex]);

  // --- Logic & Helpers (Abbreviated) ---
  const saveHistorySnapshot = () => {
    if (!maskLayerRef.current) return;
    const ctx = maskLayerRef.current.getContext('2d');
    const snapshot = ctx.getImageData(0, 0, maskLayerRef.current.width, maskLayerRef.current.height);
    const newStack = historyStack.current.slice(0, historyIndex + 1);
    newStack.push(snapshot);
    if (newStack.length > 20) newStack.shift();
    historyStack.current = newStack;
    setHistoryIndex(newStack.length - 1);
    setHistoryLength(newStack.length);
  };

  const performUndo = () => { if (historyIndex > 0) restoreSnapshot(historyIndex - 1); };
  const performRedo = () => { if (historyIndex < historyLength - 1) restoreSnapshot(historyIndex + 1); };

  const restoreSnapshot = (index) => {
    if (!maskLayerRef.current || !historyStack.current[index]) return;
    const ctx = maskLayerRef.current.getContext('2d');
    ctx.putImageData(historyStack.current[index], 0, 0);
    setHistoryIndex(index);
    triggerRender();
  };

  const handleClearMask = () => {
    if (!maskLayerRef.current) return;
    const ctx = maskLayerRef.current.getContext('2d');
    ctx.clearRect(0, 0, maskLayerRef.current.width, maskLayerRef.current.height);
    saveHistorySnapshot();
    triggerRender();
  };

  const handleFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        crystalLayerRef.current = null;
        crystalPointsRef.current = null;
        maskLayerRef.current = null;
        setViewport({ scale: 1, x: 0, y: 0 });
        historyStack.current = [];
        setHistoryIndex(-1);
        setHistoryLength(0);
      };
      reader.readAsDataURL(file);
    }
  };

  const onDrop = (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  const onDragOver = (e) => { e.preventDefault(); };

  const onImageLoad = () => {
    if (!imgRef.current || !canvasRef.current) return;
    canvasRef.current.width = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;
    const cvs = document.createElement('canvas');
    cvs.width = imgRef.current.naturalWidth;
    cvs.height = imgRef.current.naturalHeight;
    maskLayerRef.current = cvs;
    saveHistorySnapshot();
    handleFitView();
    triggerRender();
  };

  // --- Generation ---
  const handleGenerate = async () => {
    if (!imgRef.current || !canvasRef.current) return;
    setIsProcessing(true);
    try {
      const { layer, points } = await renderCrystalLayer(
        imgRef.current,
        {
          pointCount: density,
          detailBias,
          relaxation,
          showBorders
        }
      );
      crystalPointsRef.current = points;
      crystalLayerRef.current = layer;
      triggerRender();
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  useEffect(() => {
    const updateBorders = async () => {
      if (crystalPointsRef.current && imgRef.current) {
        setIsProcessing(true);
        try {
          const { layer } = await renderCrystalLayer(
            imgRef.current,
            {
              existingPoints: crystalPointsRef.current,
              showBorders,
              scale: 1
            }
          );
          crystalLayerRef.current = layer;
          triggerRender();
        } finally { setIsProcessing(false); }
      }
    };
    updateBorders();
  }, [showBorders]);

  const triggerRender = () => {
    if (!imgRef.current || !maskLayerRef.current || !canvasRef.current) return;
    renderComposite(canvasRef.current, crystalLayerRef.current, imgRef.current, maskLayerRef.current, showMask, viewOriginal);
  };
  useEffect(() => { triggerRender(); }, [showMask, viewOriginal]);

  const handleMagicSelect = async () => {
    if (!imageSrc) return;
    setIsAnalyzing(true);
    setTimeout(async () => {
      try {
        const subjectMask = await generateSubjectMask(imageSrc);
        if (!maskLayerRef.current) maskLayerRef.current = subjectMask;
        else {
          const ctx = maskLayerRef.current.getContext('2d');
          ctx.drawImage(subjectMask, 0, 0);
        }
        saveHistorySnapshot();
        triggerRender();
      } catch (err) { alert("Subject detection failed."); }
      setIsAnalyzing(false);
    }, 50);
  };

  const handleBatchExport = async () => {
    if (!imgRef.current || !crystalPointsRef.current) return;
    setIsExporting(true);
    const fullOptions = { ...exportOpts, scale: exportScale, watermark: watermarkText };
    setTimeout(async () => {
      try {
        await runBatchExport(imgRef.current, crystalPointsRef.current, maskLayerRef.current, fullOptions);
        setShowExportModal(false);
      } catch (e) { alert("Export Failed."); }
      setIsExporting(false);
    }, 100);
  };

  // --- Navigation & Viewport ---
  const handleWheel = useCallback((e) => {
    if (!imageSrc || !containerRef.current) return;
    e.preventDefault();
    const currentViewport = viewportRef.current;
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.min(Math.max(0.1, currentViewport.scale * (1 + delta)), 20);
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleRatio = newScale / currentViewport.scale;
    const newX = mouseX - (mouseX - currentViewport.x) * scaleRatio;
    const newY = mouseY - (mouseY - currentViewport.y) * scaleRatio;
    setViewport({ scale: newScale, x: newX, y: newY });
  }, [imageSrc]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleFitView = () => {
    if (!imgRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = imgRef.current.naturalWidth;
    const h = imgRef.current.naturalHeight;
    const scale = Math.min(rect.width / w, rect.height / h) * 0.8;
    const x = (rect.width - w * scale) / 2;
    const y = (rect.height - h * scale) / 2;
    setViewport({ scale, x, y });
  };

  const getPointerPos = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: cssX * scaleX, y: cssY * scaleY };
  };

  // --- UPDATED: Pointer Events (Removed !viewOriginal Check) ---
  const onPointerDown = (e) => {
    if (e.pointerType === 'touch') return;

    if (e.button === 1 || (e.button === 0 && isSpaceHeld)) {
      e.preventDefault(); setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    // FIX: Allow painting even if viewOriginal is true (removed !viewOriginal)
    if (e.button === 0 && activeTab === 'masking') {
      isDrawing.current = true;
      const { x, y } = getPointerPos(e.clientX, e.clientY);
      paint(x, y);
    }
  };

  const onPointerMove = (e) => {
    if (e.pointerType === 'touch') return;

    setCursorPos({ x: e.clientX, y: e.clientY });
    if (isPanning) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      setViewport(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    // FIX: Allow painting even if viewOriginal is true (removed !viewOriginal)
    if (isDrawing.current && activeTab === 'masking') {
      const { x, y } = getPointerPos(e.clientX, e.clientY);
      paint(x, y);
    }
  };

  const getTouchDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const getTouchCenter = (touches) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      lastTouchDistance.current = getTouchDistance(e.touches);
      lastTouchCenter.current = getTouchCenter(e.touches);
      isPinching.current = true;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      lastMousePos.current = { x: t.clientX, y: t.clientY };

      // FIX: Allow painting even if viewOriginal is true
      const shouldPaint = activeTab === 'masking' && !isSpaceHeld;

      if (shouldPaint) {
        isDrawing.current = true;
        const { x, y } = getPointerPos(t.clientX, t.clientY);
        paint(x, y);
      } else {
        setIsPanning(true);
      }
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Zoom/Pan logic
      const currentDist = getTouchDistance(e.touches);
      const currentCenter = getTouchCenter(e.touches);
      if (lastTouchDistance.current && lastTouchCenter.current) {
        const deltaZoom = currentDist / lastTouchDistance.current;
        const currentViewport = viewportRef.current;
        const newScale = Math.min(Math.max(0.1, currentViewport.scale * deltaZoom), 20);
        const deltaPanX = currentCenter.x - lastTouchCenter.current.x;
        const deltaPanY = currentCenter.y - lastTouchCenter.current.y;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = currentCenter.x - rect.left;
        const mouseY = currentCenter.y - rect.top;
        const scaleRatio = newScale / currentViewport.scale;
        const newX = mouseX - (mouseX - (currentViewport.x + deltaPanX)) * scaleRatio;
        const newY = mouseY - (mouseY - (currentViewport.y + deltaPanY)) * scaleRatio;
        setViewport({ scale: newScale, x: newX + deltaPanX, y: newY + deltaPanY });
      }
      lastTouchDistance.current = currentDist;
      lastTouchCenter.current = currentCenter;
    } else if (e.touches.length === 1) {
      // Pan or Paint
      const t = e.touches[0];
      const deltaX = t.clientX - lastMousePos.current.x;
      const deltaY = t.clientY - lastMousePos.current.y;
      if (isPanning) {
        setViewport(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
      } else if (isDrawing.current) {
        const { x, y } = getPointerPos(t.clientX, t.clientY);
        paint(x, y);
      }
      lastMousePos.current = { x: t.clientX, y: t.clientY };
    }
  };

  const handleTouchEnd = () => {
    isPinching.current = false;
    isDrawing.current = false;
    setIsPanning(false);
    lastTouchDistance.current = null;
    lastTouchCenter.current = null;
    if (activeTab === 'masking') saveHistorySnapshot();
  };

  const paint = (x, y) => {
    if (!maskLayerRef.current) return;
    const ctx = maskLayerRef.current.getContext('2d');
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    triggerRender();
  };

  // FIX: Allow 'none' cursor (brush) even if viewOriginal is true
  const getCursor = () => {
    if (isPanning || isSpaceHeld) return 'cursor-grab active:cursor-grabbing';
    if (activeTab === 'masking') return 'cursor-none';
    return 'cursor-default';
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-bg text-white overflow-hidden" onDrop={onDrop} onDragOver={onDragOver}>
      {/* --- ABOUT / LEGAL MODAL --- */}
      {showAboutModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-panel border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <button onClick={() => setShowAboutModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>

            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><span className="text-accent">◆</span> Crystalize</h2>

            <div className="space-y-4 text-sm text-gray-300 leading-relaxed">
              <section>
                <h3 className="text-white font-bold mb-1">Privacy Policy</h3>
                <p>
                  We respect your privacy. <strong>This application runs entirely on your device. </strong>
                  When you "upload" an image, it is processed locally in your browser's memory.
                  Your photos are never sent to a server, stored in a database, or seen by the developers.
                </p>
              </section>

              <section>
                <h3 className="text-white font-bold mb-1">Terms of Service</h3>
                <p>
                  This application is provided "as is", without warranty of any kind.
                  You retain full copyright and ownership of any images you generate.
                </p>
              </section>

              <section>
                <h3 className="text-white font-bold mb-1">Open Source</h3>
                <p>
                  This project is open source and available under the AGPL-3.0 license.
                </p>
                <a
                  href="https://github.com/beanz-y/voronoi"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-2 text-accent hover:text-white transition"
                >
                  <Github size={16} />
                  <span>View Source Code</span>
                </a>
              </section>

              <section>
                <h3 className="text-white font-bold mb-1">Software Credits</h3>
                <p className="text-xs text-gray-500">
                  This application utilizes open source software:<br />
                  • <a href="https://github.com/d3/d3-delaunay" target="_blank" rel="noreferrer" className="underline hover:text-accent">d3-delaunay</a> (ISC License)<br />
                  • <a href="https://github.com/imgly/background-removal-js" target="_blank" rel="noreferrer" className="underline hover:text-accent">@imgly/background-removal</a> (AGPL-3.0)<br />
                  • <a href="https://lucide.dev/license" target="_blank" rel="noreferrer" className="underline hover:text-accent">Lucide React</a> (ISC License)
                </p>
              </section>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-700 text-center">
              <button onClick={() => setShowAboutModal(false)} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-medium transition">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-panel border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setShowExportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-xl font-bold mb-4">Batch Export</h2>
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Export Scale</label>
                <div className="flex gap-2">{[1, 2, 4, 8].map(scale => (<button key={scale} onClick={() => setExportScale(scale)} className={`flex-1 py-2 rounded border font-bold text-sm transition ${exportScale === scale ? 'bg-accent border-accent text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>{scale}x</button>))}</div>
              </div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">Watermark Text</label><input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="e.g. Acme Photography" className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm text-white focus:border-accent outline-none" /></div>
            </div>
            <div className="space-y-3 mb-8">
              <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-600 transition"><input type="checkbox" checked={exportOpts.bm} onChange={e => setExportOpts({ ...exportOpts, bm: e.target.checked })} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" /><div className="font-bold text-sm">Border + Masked</div></label>
              <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-600 transition"><input type="checkbox" checked={exportOpts.bf} onChange={e => setExportOpts({ ...exportOpts, bf: e.target.checked })} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" /><div className="font-bold text-sm">Border + Full</div></label>
              <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-600 transition"><input type="checkbox" checked={exportOpts.nm} onChange={e => setExportOpts({ ...exportOpts, nm: e.target.checked })} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" /><div className="font-bold text-sm">No Border + Masked</div></label>
              <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-600 transition"><input type="checkbox" checked={exportOpts.nf} onChange={e => setExportOpts({ ...exportOpts, nf: e.target.checked })} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" /><div className="font-bold text-sm">No Border + Full</div></label>
            </div>
            <button onClick={handleBatchExport} disabled={isExporting} className="w-full py-3 bg-accent hover:bg-accentHover text-white font-bold rounded flex items-center justify-center gap-2">{isExporting ? "Zipping..." : <><Download size={18} /> Download ZIP</>}</button>
          </div>
        </div>
      )}

      {/* FIX: Show Brush Cursor even if viewOriginal is true (removed !viewOriginal) */}
      {activeTab === 'masking' && !isPanning && !isSpaceHeld && imageSrc && (
        <div className="fixed pointer-events-none rounded-full border border-white mix-blend-difference z-50" style={{ left: cursorPos.x, top: cursorPos.y, width: brushSize * viewport.scale, height: brushSize * viewport.scale, transform: 'translate(-50%, -50%)', boxShadow: '0 0 2px 0 rgba(0,0,0,0.5)' }} />
      )}

      {/* MOBILE HEADER */}
      <div className="md:hidden flex items-center justify-between p-4 bg-panel border-b border-gray-700 z-[101] relative shrink-0">
        <h1 className="text-lg font-bold flex items-center gap-2"><span className="text-accent">◆</span> Crystalize</h1>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-300 hover:text-white">
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* SIDEBAR */}
      <div className={`
          fixed inset-y-0 left-0 w-80 bg-panel border-r border-gray-700 flex flex-col p-4 z-[100] shadow-2xl transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          mt-[60px] md:mt-0 h-[calc(100dvh-60px)] md:h-full
      `}>
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2 hidden md:flex"><span className="text-accent">◆</span> Crystalize Web</h1>        <div className="flex p-1 bg-gray-800 rounded-lg mb-6">
          <button onClick={() => setActiveTab('crystals')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'crystals' ? 'bg-gray-600' : 'text-gray-400'}`}>Generation</button>
          <button onClick={() => setActiveTab('masking')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'masking' ? 'bg-gray-600' : 'text-gray-400'}`}>Masking</button>
        </div>

        {activeTab === 'crystals' && (
          <div className="space-y-6">
            <div className="mb-4"><label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-800 transition"><div className="flex flex-col items-center justify-center pt-5 pb-6"><Upload className="w-8 h-8 mb-2 text-gray-400" /><p className="text-sm text-gray-400">Drop Image or Click</p></div><input type="file" className="hidden" accept="image/*" onChange={(e) => { handleFile(e.target.files[0]); setIsSidebarOpen(false); }} /></label></div>
            <div><div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-300">Cell Density</label><span className="text-xs text-accent font-mono">{density.toLocaleString()}</span></div><input type="range" min="500" max="20000" step="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-accent" /></div>

            {/* Focus Details Slider */}
            <div>
              <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-300">Focus Details</label><span className="text-xs text-accent font-mono">{Math.round(detailBias * 100)}%</span></div>
              <input type="range" min="0" max="1" step="0.1" value={detailBias} onChange={(e) => setDetailBias(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-indigo-500" />
              <p className="text-xs text-gray-500 mt-1">Snaps crystals to edges and high contrast.</p>
            </div>

            {/* Regularity Slider */}
            <div>
              <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-300">Regularity</label><span className="text-xs text-accent font-mono">{relaxation}</span></div>
              <input type="range" min="0" max="10" step="1" value={relaxation} onChange={(e) => setRelaxation(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-accent" />
              <p className="text-xs text-gray-500 mt-1">Smoothes shapes. (High regularity reduces detail)</p>
            </div>

            <div className="space-y-3 bg-gray-800 p-3 rounded-lg border border-gray-700"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={showBorders} onChange={(e) => setShowBorders(e.target.checked)} className="w-5 h-5 rounded border-gray-600 text-accent focus:ring-accent bg-gray-700" /><span className="text-sm text-gray-200">Internal Borders</span></label></div>
            <button onClick={() => { handleGenerate(); setIsSidebarOpen(false); }} disabled={!imageSrc || isProcessing} className="w-full py-3 px-4 rounded-md font-bold text-white bg-accent hover:bg-accentHover shadow-lg">{isProcessing ? 'Processing...' : 'Generate Crystals'}</button>
            <div className="pt-8 border-t border-gray-700"><button onClick={() => { setShowExportModal(true); setIsSidebarOpen(false); }} disabled={!imageSrc || !crystalPointsRef.current} className={`w-full py-3 px-4 rounded-md font-bold text-white flex items-center justify-center gap-2 transition ${(!imageSrc || !crystalPointsRef.current) ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 hover:text-white'}`}><Download size={18} /><span>Batch Export...</span></button></div>
          </div>
        )}

        {activeTab === 'masking' && (
          <div className="space-y-6">
            <button onClick={() => { handleMagicSelect(); setIsSidebarOpen(false); }} disabled={isAnalyzing} className={`w-full py-3 px-4 rounded-md font-bold text-white shadow-lg flex items-center justify-center gap-2 transition ${isAnalyzing ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{isAnalyzing ? <><span className="animate-spin text-xl">⟳</span><span>Analyzing...</span></> : <><Sparkles size={18} /><span>Auto-Detect Subject</span></>}</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCurrentTool('brush')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'brush' ? 'bg-accent border-accent' : 'bg-gray-800 border-gray-700'}`}><Brush size={20} /><span className="text-xs font-bold">Brush</span></button>
              <button onClick={() => setCurrentTool('eraser')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'eraser' ? 'bg-red-500 border-red-500' : 'bg-gray-800 border-gray-700'}`}><Eraser size={20} /><span className="text-xs font-bold">Eraser</span></button>
            </div>
            <div className="grid grid-cols-3 gap-2"><button onClick={performUndo} disabled={historyIndex <= 0} className={`p-2 rounded flex items-center justify-center bg-gray-800 border border-gray-700 ${historyIndex <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}><Undo size={18} /></button><button onClick={performRedo} disabled={historyIndex >= historyLength - 1} className={`p-2 rounded flex items-center justify-center bg-gray-800 border border-gray-700 ${historyIndex >= historyLength - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}><Redo size={18} /></button><button onClick={handleClearMask} className="p-2 rounded flex items-center justify-center bg-red-900/30 border border-red-500 text-red-400 hover:bg-red-900/50"><Trash2 size={18} /></button></div>
            <div><label className="text-sm font-medium text-gray-300">Brush Size: {brushSize}px</label><input type="range" min="10" max="300" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-gray-400" /></div>
            <button onClick={() => setShowMask(!showMask)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 transition ${showMask ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-gray-800 border-gray-700'}`}><Eye size={16} />{showMask ? "Hide Mask" : "Show Mask"}</button>
            <button onClick={() => setViewOriginal(!viewOriginal)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 transition ${viewOriginal ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-gray-800 border-gray-700'}`}><ImageIcon size={16} />{viewOriginal ? "Hide Original" : "View Original"}</button>
          </div>
        )}

        {/* NEW: Footer Area in Sidebar */}
        <div className="mt-auto pt-6 border-t border-gray-700 flex justify-between items-center text-gray-500">
          <span className="text-xs">v1.0.0</span>
          <button
            onClick={() => { setShowAboutModal(true); setIsSidebarOpen(false); }}
            className="flex items-center gap-2 text-xs hover:text-accent transition"
          >
            <Info size={14} /> <span>About & Privacy</span>
          </button>
        </div>
      </div>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-[90] md:hidden" onClick={() => setIsSidebarOpen(false)} />}

      {/* CANVAS CONTAINER */}
      <div
        ref={containerRef}
        className={`flex-1 bg-[#111] relative overflow-hidden ${getCursor()} touch-none z-0`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {!imageSrc && <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none"><ImageIcon className="w-16 h-16 mb-4 opacity-20" /><p>Drag & Drop Image Here</p></div>}
        <img ref={imgRef} src={imageSrc} alt="" className="hidden" onLoad={onImageLoad} />
        <div style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, transformOrigin: '0 0', willChange: 'transform' }} className="inline-block origin-top-left">
          <canvas ref={canvasRef} className={`shadow-2xl border border-gray-800 ${!imageSrc ? 'hidden' : 'block'}`} />
        </div>
      </div>
    </div>
  );
}

export default App;