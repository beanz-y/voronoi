import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    Upload, Image as ImageIcon, Eraser, Brush, Eye, 
    Sparkles, Download, X, Undo, Redo, Trash2,
    Menu, ChevronLeft
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

  // Settings
  const [showBorders, setShowBorders] = useState(true);
  const [viewOriginal, setViewOriginal] = useState(false);

  // Masking
  const [currentTool, setCurrentTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(50);
  const [showMask, setShowMask] = useState(false);

  // UI State
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(false); 
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOpts, setExportOpts] = useState({ bm: true, bf: true, nm: true, nf: true });
  const [isExporting, setIsExporting] = useState(false);

  // History
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyLength, setHistoryLength] = useState(0);

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
  const historyStack = useRef([]);
  
  // Touch/Gesture Refs
  const lastMousePos = useRef({ x: 0, y: 0 });
  const touchStartDist = useRef(0);
  const lastTouchCenter = useRef({ x: 0, y: 0 });

  // Viewport Ref Sync
  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // --- Resize Listener ---
  useEffect(() => {
    const handleResize = () => {
        setIsMobile(window.innerWidth < 768);
        if (window.innerWidth >= 768) {
            setSidebarOpen(false); // Reset mobile state when going to desktop
        }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Global Listeners ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setIsSpaceHeld(true); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); performUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); performRedo(); }
    };
    const handleKeyUp = (e) => {
      if (e.code === "Space") { setIsSpaceHeld(false); setIsPanning(false); }
    };
    const handleGlobalPointerUp = () => { 
        setIsPanning(false); 
        touchStartDist.current = 0; 
        if (isDrawing.current) {
            isDrawing.current = false;
            saveHistorySnapshot(); 
        }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("touchend", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("touchend", handleGlobalPointerUp);
    };
  }, [historyIndex]);

  // --- Logic Blocks ---
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
    maskLayerRef.current.getContext('2d').putImageData(historyStack.current[index], 0, 0);
    setHistoryIndex(index);
    triggerRender();
  };
  const handleClearMask = () => {
    if (!maskLayerRef.current) return;
    maskLayerRef.current.getContext('2d').clearRect(0, 0, maskLayerRef.current.width, maskLayerRef.current.height);
    saveHistorySnapshot();
    triggerRender();
  };
  
  // RESTORED: Drag and Drop Handlers
  const handleFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        crystalLayerRef.current = null; crystalPointsRef.current = null; maskLayerRef.current = null;
        setViewport({ scale: 1, x: 0, y: 0 });
        historyStack.current = []; setHistoryIndex(-1); setHistoryLength(0);
        if (isMobile) setSidebarOpen(false); 
      };
      reader.readAsDataURL(file);
    }
  };
  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };
  const onDragOver = (e) => { e.preventDefault(); };
  // END RESTORED BLOCK

  const onImageLoad = () => {
    if (!imgRef.current || !canvasRef.current) return;
    canvasRef.current.width = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;
    const cvs = document.createElement('canvas');
    cvs.width = imgRef.current.naturalWidth; cvs.height = imgRef.current.naturalHeight;
    maskLayerRef.current = cvs;
    saveHistorySnapshot();
    handleFitView();
    triggerRender();
  };
  const handleGenerate = () => {
    if (!imgRef.current) return;
    setIsProcessing(true);
    setTimeout(() => {
      const points = generateVoronoiPoints(imgRef.current.naturalWidth, imgRef.current.naturalHeight, density);
      crystalPointsRef.current = points;
      crystalLayerRef.current = renderCrystalLayer(imgRef.current, points, { showBorders });
      triggerRender();
      setIsProcessing(false);
      if (isMobile) setSidebarOpen(false);
    }, 50);
  };
  useEffect(() => {
    if (crystalPointsRef.current && imgRef.current) {
        crystalLayerRef.current = renderCrystalLayer(imgRef.current, crystalPointsRef.current, { showBorders });
        triggerRender();
    }
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
        else { maskLayerRef.current.getContext('2d').drawImage(subjectMask, 0, 0); }
        saveHistorySnapshot(); triggerRender();
      } catch (err) { console.error(err); alert("Subject detection failed."); }
      setIsAnalyzing(false);
    }, 50);
  };
  const handleBatchExport = async () => {
    if (!imgRef.current || !crystalPointsRef.current) return;
    setIsExporting(true);
    setTimeout(async () => {
        try { await runBatchExport(imgRef.current, crystalPointsRef.current, maskLayerRef.current, exportOpts); setShowExportModal(false); } 
        catch (e) { console.error(e); alert("Export Failed."); }
        setIsExporting(false);
    }, 100);
  };

  // --- NAVIGATION (MOUSE WHEEL) ---
  const handleWheel = useCallback((e) => {
    if (!imageSrc || !containerRef.current) return;
    e.preventDefault();
    const currentViewport = viewportRef.current;
    const delta = -e.deltaY * 0.001;
    const newScale = Math.min(Math.max(0.1, currentViewport.scale * (1 + delta)), 20);
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const scaleRatio = newScale / currentViewport.scale;
    const newX = mouseX - (mouseX - currentViewport.x) * scaleRatio;
    const newY = mouseY - (mouseY - currentViewport.y) * scaleRatio;
    setViewport({ scale: newScale, x: newX, y: newY });
  }, [imageSrc]);

  // --- TOUCH GESTURES ---
  const getTouchDist = (t1, t2) => {
    const dx = t1.clientX - t2.clientX; const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  };
  const getTouchCenter = (t1, t2) => {
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  };
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      touchStartDist.current = getTouchDist(e.touches[0], e.touches[1]);
      lastTouchCenter.current = getTouchCenter(e.touches[0], e.touches[1]);
      setIsPanning(true); 
    } else if (e.touches.length === 1) {
        const t = e.touches[0];
        lastMousePos.current = { x: t.clientX, y: t.clientY };
        if (activeTab === 'masking' && !viewOriginal) {
            isDrawing.current = true;
            const { x, y } = getPointerPos(t); paint(x, y);
        } else { setIsPanning(true); }
    }
  };
  const onTouchMove = (e) => {
    if (e.cancelable) e.preventDefault(); 
    if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      const currentViewport = viewportRef.current;
      if (touchStartDist.current > 0) {
        const zoomFactor = dist / touchStartDist.current;
        const newScale = Math.min(Math.max(0.1, currentViewport.scale * zoomFactor), 20);
        const deltaX = center.x - lastTouchCenter.current.x;
        const deltaY = center.y - lastTouchCenter.current.y;
        setViewport({ scale: newScale, x: currentViewport.x + deltaX, y: currentViewport.y + deltaY });
        touchStartDist.current = dist;
        lastTouchCenter.current = center;
      }
    } else if (e.touches.length === 1) {
       const t = e.touches[0];
       if (isDrawing.current && activeTab === 'masking' && !viewOriginal) {
           const { x, y } = getPointerPos(t); paint(x, y);
       } else if (isPanning) {
           const deltaX = t.clientX - lastMousePos.current.x;
           const deltaY = t.clientY - lastMousePos.current.y;
           setViewport(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
           lastMousePos.current = { x: t.clientX, y: t.clientY };
       }
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, [handleWheel, activeTab, viewOriginal]);

  const handleFitView = () => {
    if (!imgRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = imgRef.current.naturalWidth; const h = imgRef.current.naturalHeight;
    const scale = Math.min(rect.width / w, rect.height / h) * 0.8;
    setViewport({ scale, x: (rect.width - w * scale) / 2, y: (rect.height - h * scale) / 2 });
  };

  const getPointerPos = (clientObj) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cssX = clientObj.clientX - rect.left;
    const cssY = clientObj.clientY - rect.top;
    return { x: cssX * (canvas.width / rect.width), y: cssY * (canvas.height / rect.height) };
  };
  const onMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && isSpaceHeld)) {
      e.preventDefault(); setIsPanning(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; return;
    }
    if (e.button === 0 && activeTab === 'masking' && !isSpaceHeld && !viewOriginal) {
      isDrawing.current = true; const { x, y } = getPointerPos(e); paint(x, y);
    }
  };
  const onMouseMove = (e) => {
    setCursorPos({ x: e.clientX, y: e.clientY });
    if (isPanning) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      setViewport(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (isDrawing.current) {
      const { x, y } = getPointerPos(e); paint(x, y);
    }
  };
  const paint = (x, y) => {
    if (!maskLayerRef.current) return;
    const ctx = maskLayerRef.current.getContext('2d');
    ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2); ctx.fill();
    triggerRender();
  };

  // --- DYNAMIC CLASSES ---
  const sidebarClasses = isMobile 
    ? `fixed inset-y-0 left-0 z-50 w-80 bg-panel border-r border-gray-700 flex flex-col p-4 shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
    : `w-80 flex-shrink-0 bg-panel border-r border-gray-700 flex flex-col p-4 z-20 shadow-xl`;

  return (
    <div className="flex h-screen w-full bg-bg text-white overflow-hidden" onDrop={onDrop} onDragOver={onDragOver}>
      
      {/* EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-panel border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl relative">
                <button onClick={() => setShowExportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
                <h2 className="text-xl font-bold mb-4">Batch Export</h2>
                <div className="space-y-3 mb-8">
                    {['bm', 'bf', 'nm', 'nf'].map(k => (
                        <label key={k} className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700"><input type="checkbox" checked={exportOpts[k]} onChange={e => setExportOpts({...exportOpts, [k]: e.target.checked})} className="w-5 h-5 rounded bg-gray-700 accent-accent" /><span>{k.toUpperCase()}</span></label>
                    ))}
                </div>
                <button onClick={handleBatchExport} disabled={isExporting} className="w-full py-3 bg-accent text-white font-bold rounded">{isExporting ? "Zipping..." : "Download ZIP"}</button>
            </div>
        </div>
      )}

      {/* MOBILE MENU TOGGLE */}
      {isMobile && (
        <button onClick={() => setSidebarOpen(true)} className="absolute top-4 left-4 z-40 p-2 bg-panel border border-gray-700 rounded shadow-lg">
            <Menu size={24} />
        </button>
      )}

      {/* SIDEBAR */}
      <div className={sidebarClasses}>
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold flex items-center gap-2"><span className="text-accent">◆</span> Crystalize</h1>
            {isMobile && <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-gray-700 rounded"><ChevronLeft size={24} /></button>}
        </div>

        <div className="flex p-1 bg-gray-800 rounded-lg mb-6">
          <button onClick={() => setActiveTab('crystals')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'crystals' ? 'bg-gray-600' : 'text-gray-400'}`}>Generation</button>
          <button onClick={() => setActiveTab('masking')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'masking' ? 'bg-gray-600' : 'text-gray-400'}`}>Masking</button>
        </div>

        {activeTab === 'crystals' ? (
          <div className="space-y-6 overflow-y-auto pb-4">
             <div className="mb-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-800">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6"><Upload className="w-8 h-8 mb-2 text-gray-400" /><p className="text-sm text-gray-400">Upload Image</p></div>
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(e.target.files[0])} />
                </label>
              </div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-300">Density</label><span className="text-xs text-accent font-mono">{density.toLocaleString()}</span></div>
              <input type="range" min="500" max="20000" step="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-accent" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-800 rounded border border-gray-700"><input type="checkbox" checked={showBorders} onChange={(e) => setShowBorders(e.target.checked)} className="w-5 h-5 rounded bg-gray-700 accent-accent" /><span className="text-sm text-gray-200">Internal Borders</span></label>
            <button onClick={handleGenerate} disabled={!imageSrc || isProcessing} className="w-full py-3 px-4 rounded-md font-bold text-white bg-accent shadow-lg">{isProcessing ? 'Processing...' : 'Generate'}</button>
            <div className="pt-8 border-t border-gray-700"><button onClick={() => setShowExportModal(true)} disabled={!imageSrc || !crystalPointsRef.current} className="w-full py-3 bg-gray-700 text-white rounded font-bold flex justify-center gap-2"><Download size={18} /> Batch Export</button></div>
          </div>
        ) : (
          <div className="space-y-6 overflow-y-auto pb-4">
            <button onClick={handleMagicSelect} disabled={isAnalyzing} className={`w-full py-3 px-4 rounded-md font-bold text-white shadow-lg flex items-center justify-center gap-2 transition ${isAnalyzing ? 'bg-indigo-800' : 'bg-indigo-600'}`}>{isAnalyzing ? 'Analyzing...' : <><Sparkles size={18} /> Auto-Detect</>}</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCurrentTool('brush')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'brush' ? 'bg-accent border-accent' : 'bg-gray-800 border-gray-700'}`}><Brush size={20} /><span className="text-xs font-bold">Brush</span></button>
              <button onClick={() => setCurrentTool('eraser')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'eraser' ? 'bg-red-500 border-red-500' : 'bg-gray-800 border-gray-700'}`}><Eraser size={20} /><span className="text-xs font-bold">Eraser</span></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <button onClick={performUndo} disabled={historyIndex <= 0} className="p-2 bg-gray-800 border border-gray-700 rounded flex justify-center"><Undo size={18} /></button>
                <button onClick={performRedo} disabled={historyIndex >= historyLength - 1} className="p-2 bg-gray-800 border border-gray-700 rounded flex justify-center"><Redo size={18} /></button>
                <button onClick={handleClearMask} className="p-2 bg-red-900/30 border border-red-500 rounded flex justify-center text-red-400"><Trash2 size={18} /></button>
            </div>
            <div><label className="text-sm font-medium text-gray-300">Size: {brushSize}px</label><input type="range" min="10" max="300" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-gray-400" /></div>
            <button onClick={() => setShowMask(!showMask)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 ${showMask ? 'bg-red-900/30 border-red-500' : 'bg-gray-800 border-gray-700'}`}><Eye size={16} />{showMask ? "Hide Mask" : "Show Mask"}</button>
            <button onClick={() => setViewOriginal(!viewOriginal)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 ${viewOriginal ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-800 border-gray-700'}`}><ImageIcon size={16} />{viewOriginal ? "Hide Original" : "View Original"}</button>
          </div>
        )}
      </div>
      
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" />}

      {/* VIEWPORT */}
      <div 
        ref={containerRef}
        className={`flex-1 bg-[#111] relative overflow-hidden touch-none`} 
        onMouseDown={onMouseDown} 
        onMouseMove={onMouseMove}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!imageSrc && <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none"><ImageIcon className="w-16 h-16 mb-4 opacity-20" /><p>Upload Image</p></div>}
        
        {/* Brush Cursor (Desktop Only) */}
        {!isMobile && !isPanning && !isSpaceHeld && !viewOriginal && imageSrc && activeTab === 'masking' && (
            <div className="hidden md:block fixed pointer-events-none rounded-full border border-white mix-blend-difference z-50" style={{ left: cursorPos.x, top: cursorPos.y, width: brushSize * viewport.scale, height: brushSize * viewport.scale, transform: 'translate(-50%, -50%)', boxShadow: '0 0 2px 0 rgba(0,0,0,0.5)' }} />
        )}

        <img ref={imgRef} src={imageSrc} alt="" className="hidden" onLoad={onImageLoad} />
        <div style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, transformOrigin: '0 0', willChange: 'transform' }} className="inline-block origin-top-left">
            <canvas ref={canvasRef} className={`shadow-2xl border border-gray-800 ${!imageSrc ? 'hidden' : 'block'}`} />
        </div>
      </div>
    </div>
  );
}

export default App;