import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Eraser, Brush, Eye, Sparkles, Download, X } from 'lucide-react';
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

  // Export Dialog State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOpts, setExportOpts] = useState({
    bm: true, // Border + Masked
    bf: true, // Border + Full
    nm: true, // No Border + Masked
    nf: true  // No Border + Full
  });
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
  const crystalPointsRef = useRef(null); // The Math Data
  const isDrawing = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // --- Global Listeners ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setIsSpaceHeld(true); }
    };
    const handleKeyUp = (e) => {
      if (e.code === "Space") { setIsSpaceHeld(false); setIsPanning(false); }
    };
    const handleGlobalPointerUp = () => { setIsPanning(false); isDrawing.current = false; };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, []);

  // --- Image Handling ---
  const handleFile = (file) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        crystalLayerRef.current = null;
        crystalPointsRef.current = null;
        maskLayerRef.current = null;
        setViewport({ scale: 1, x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e) => { e.preventDefault(); };

  const onImageLoad = () => {
    if (!imgRef.current || !canvasRef.current) return;
    canvasRef.current.width = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;

    const cvs = document.createElement('canvas');
    cvs.width = imgRef.current.naturalWidth;
    cvs.height = imgRef.current.naturalHeight;
    maskLayerRef.current = cvs;
    
    handleFitView();
    triggerRender();
  };

  // --- Generation ---
  const handleGenerate = () => {
    if (!imgRef.current || !canvasRef.current) return;
    setIsProcessing(true);
    setTimeout(() => {
      const points = generateVoronoiPoints(
          imgRef.current.naturalWidth, 
          imgRef.current.naturalHeight, 
          density
      );
      crystalPointsRef.current = points;
      crystalLayerRef.current = renderCrystalLayer(imgRef.current, points, { showBorders });
      triggerRender();
      setIsProcessing(false);
    }, 50);
  };

  useEffect(() => {
    if (crystalPointsRef.current && imgRef.current) {
        crystalLayerRef.current = renderCrystalLayer(
            imgRef.current, 
            crystalPointsRef.current, 
            { showBorders }
        );
        triggerRender();
    }
  }, [showBorders]);

  const triggerRender = () => {
    if (!imgRef.current || !maskLayerRef.current || !canvasRef.current) return;
    renderComposite(
      canvasRef.current,
      crystalLayerRef.current,
      imgRef.current,
      maskLayerRef.current,
      showMask,
      viewOriginal
    );
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
        triggerRender();
      } catch (err) {
        console.error(err);
        alert("Subject detection failed.");
      }
      setIsAnalyzing(false);
    }, 50);
  };

  // --- Export Logic ---
  const handleBatchExport = async () => {
    if (!imgRef.current || !crystalPointsRef.current) return;
    setIsExporting(true);
    
    // Allow UI to update before freezing
    setTimeout(async () => {
        try {
            await runBatchExport(
                imgRef.current,
                crystalPointsRef.current,
                maskLayerRef.current,
                exportOpts
            );
            setShowExportModal(false);
        } catch (e) {
            console.error(e);
            alert("Export Failed.");
        }
        setIsExporting(false);
    }, 100);
  };

  // --- Navigation ---
  const handleWheel = (e) => {
    if (!imageSrc || !containerRef.current) return;
    e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? (1 + zoomIntensity) : (1 / (1 + zoomIntensity));
    const newScale = Math.min(Math.max(0.1, viewport.scale * factor), 20);
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - viewport.x) * (newScale / viewport.scale);
    const newY = mouseY - (mouseY - viewport.y) * (newScale / viewport.scale);

    setViewport({ scale: newScale, x: newX, y: newY });
  };

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

  const getPointerPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: cssX * scaleX, y: cssY * scaleY };
  };

  const onPointerDown = (e) => {
    if (e.button === 1 || (e.button === 0 && isSpaceHeld)) {
      e.preventDefault(); setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button === 0 && activeTab === 'masking' && !isSpaceHeld && !viewOriginal) {
      isDrawing.current = true;
      const { x, y } = getPointerPos(e);
      paint(x, y);
    }
  };

  const onPointerMove = (e) => {
    setCursorPos({ x: e.clientX, y: e.clientY });
    if (isPanning) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      setViewport(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (isDrawing.current && activeTab === 'masking' && !isSpaceHeld && !viewOriginal) {
      const { x, y } = getPointerPos(e);
      paint(x, y);
    }
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

  const getCursor = () => {
    if (isPanning || isSpaceHeld) return 'cursor-grab active:cursor-grabbing';
    if (activeTab === 'masking' && !viewOriginal) return 'cursor-none';
    return 'cursor-default';
  };

  return (
    <div className="flex h-screen w-full bg-bg text-white overflow-hidden" onDrop={onDrop} onDragOver={onDragOver}>
      
      {/* EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-panel border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl relative">
                <button 
                    onClick={() => setShowExportModal(false)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold mb-4">Batch Export</h2>
                <p className="text-sm text-gray-400 mb-6">Select which variations to include in the ZIP file.</p>
                
                <div className="space-y-3 mb-8">
                    <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-500">
                        <input type="checkbox" checked={exportOpts.bm} onChange={e => setExportOpts({...exportOpts, bm: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" />
                        <div>
                            <div className="font-bold text-sm">Border + Masked</div>
                            <div className="text-xs text-gray-400">Black outlines, subject revealed.</div>
                        </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-500">
                        <input type="checkbox" checked={exportOpts.bf} onChange={e => setExportOpts({...exportOpts, bf: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" />
                        <div>
                            <div className="font-bold text-sm">Border + Full</div>
                            <div className="text-xs text-gray-400">Black outlines, pure crystals.</div>
                        </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-500">
                        <input type="checkbox" checked={exportOpts.nm} onChange={e => setExportOpts({...exportOpts, nm: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" />
                        <div>
                            <div className="font-bold text-sm">No Border + Masked</div>
                            <div className="text-xs text-gray-400">Flat shapes, subject revealed.</div>
                        </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700 cursor-pointer hover:border-gray-500">
                        <input type="checkbox" checked={exportOpts.nf} onChange={e => setExportOpts({...exportOpts, nf: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-gray-700 accent-accent" />
                        <div>
                            <div className="font-bold text-sm">No Border + Full</div>
                            <div className="text-xs text-gray-400">Flat shapes, pure crystals.</div>
                        </div>
                    </label>
                </div>

                <button 
                    onClick={handleBatchExport}
                    disabled={isExporting}
                    className="w-full py-3 bg-accent hover:bg-accentHover text-white font-bold rounded flex items-center justify-center gap-2"
                >
                    {isExporting ? "Zipping..." : <><Download size={18} /> Download ZIP</>}
                </button>
            </div>
        </div>
      )}

      {/* BRUSH CURSOR */}
      {activeTab === 'masking' && !isPanning && !isSpaceHeld && !viewOriginal && imageSrc && (
        <div 
            className="fixed pointer-events-none rounded-full border border-white mix-blend-difference z-50"
            style={{
                left: cursorPos.x, top: cursorPos.y,
                width: brushSize * viewport.scale, height: brushSize * viewport.scale,
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 2px 0 rgba(0,0,0,0.5)' 
            }}
        />
      )}

      {/* SIDEBAR */}
      <div className="w-80 flex-shrink-0 bg-panel border-r border-gray-700 flex flex-col p-4 z-20 shadow-xl">
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="text-accent">◆</span> Crystalize Web
        </h1>

        <div className="flex p-1 bg-gray-800 rounded-lg mb-6">
          <button onClick={() => setActiveTab('crystals')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'crystals' ? 'bg-gray-600' : 'text-gray-400'}`}>Generation</button>
          <button onClick={() => setActiveTab('masking')} className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'masking' ? 'bg-gray-600' : 'text-gray-400'}`}>Masking</button>
        </div>

        {/* TAB: CRYSTALS */}
        {activeTab === 'crystals' && (
          <div className="space-y-6">
             <div className="mb-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-800 transition">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 mb-2 text-gray-400" />
                    <p className="text-sm text-gray-400">Drop Image or Click</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFile(e.target.files[0])} />
                </label>
              </div>

            {/* RESTORED: Density Label */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Cell Density</label>
                <span className="text-xs text-accent font-mono">{density.toLocaleString()}</span>
              </div>
              <input type="range" min="500" max="20000" step="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-accent" />
            </div>

            <div className="space-y-3 bg-gray-800 p-3 rounded-lg border border-gray-700">
                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={showBorders} onChange={(e) => setShowBorders(e.target.checked)} className="w-5 h-5 rounded border-gray-600 text-accent focus:ring-accent bg-gray-700" />
                    <span className="text-sm text-gray-200">Internal Borders</span>
                </label>
            </div>

            <button onClick={handleGenerate} disabled={!imageSrc || isProcessing} className="w-full py-3 px-4 rounded-md font-bold text-white bg-accent hover:bg-accentHover shadow-lg">
              {isProcessing ? 'Processing...' : 'Generate Crystals'}
            </button>
            
            {/* NEW: Batch Export Button (Bottom of Sidebar) */}
            <div className="pt-8 border-t border-gray-700">
                 <button 
                    onClick={() => setShowExportModal(true)}
                    disabled={!imageSrc || !crystalPointsRef.current} // Disable if no crystals generated
                    className={`w-full py-3 px-4 rounded-md font-bold text-white flex items-center justify-center gap-2 transition
                    ${(!imageSrc || !crystalPointsRef.current) ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 hover:text-white'}`}
                >
                    <Download size={18} />
                    <span>Batch Export...</span>
                </button>
            </div>
          </div>
        )}

        {/* TAB: MASKING */}
        {activeTab === 'masking' && (
          <div className="space-y-6">
            <button onClick={handleMagicSelect} disabled={isAnalyzing} className={`w-full py-3 px-4 rounded-md font-bold text-white shadow-lg flex items-center justify-center gap-2 transition ${isAnalyzing ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {isAnalyzing ? <><span className="animate-spin text-xl">⟳</span><span>Analyzing...</span></> : <><Sparkles size={18} /><span>Auto-Detect Subject</span></>}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCurrentTool('brush')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'brush' ? 'bg-accent border-accent' : 'bg-gray-800 border-gray-700'}`}><Brush size={20} /><span className="text-xs font-bold">Brush</span></button>
              <button onClick={() => setCurrentTool('eraser')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'eraser' ? 'bg-red-500 border-red-500' : 'bg-gray-800 border-gray-700'}`}><Eraser size={20} /><span className="text-xs font-bold">Eraser</span></button>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Brush Size: {brushSize}px</label>
              <input type="range" min="10" max="300" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-gray-400" />
            </div>
            <button onClick={() => setShowMask(!showMask)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 transition ${showMask ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-gray-800 border-gray-700'}`}><Eye size={16} />{showMask ? "Hide Mask" : "Show Mask"}</button>
            <button onClick={() => setViewOriginal(!viewOriginal)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 transition ${viewOriginal ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-gray-800 border-gray-700'}`}><ImageIcon size={16} />{viewOriginal ? "Hide Original" : "View Original"}</button>
          </div>
        )}
      </div>

      {/* VIEWPORT */}
      <div 
        ref={containerRef}
        className={`flex-1 bg-[#111] relative overflow-hidden ${getCursor()}`} 
        onWheel={handleWheel}
        onPointerDown={onPointerDown} 
        onPointerMove={onPointerMove}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!imageSrc && <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none"><ImageIcon className="w-16 h-16 mb-4 opacity-20" /><p>Drag & Drop Image Here</p></div>}
        <img ref={imgRef} src={imageSrc} alt="" className="hidden" onLoad={onImageLoad} />
        <div 
            style={{ 
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0', 
                willChange: 'transform',
            }}
            className="inline-block origin-top-left"
        >
            <canvas ref={canvasRef} className={`shadow-2xl border border-gray-800 ${!imageSrc ? 'hidden' : 'block'}`} />
        </div>
      </div>
    </div>
  );
}

export default App;