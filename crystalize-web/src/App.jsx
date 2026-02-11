import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Image as ImageIcon, Eraser, Brush, Eye, Sparkles, RotateCcw } from 'lucide-react';
import { generateCrystalLayer } from './lib/crystalizer';
import { renderComposite } from './lib/compositor';
import { generateSubjectMask } from './lib/ai-mask';

function App() {
  // --- State ---
  const [imageSrc, setImageSrc] = useState(null);
  const [density, setDensity] = useState(5000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('crystals');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Masking Settings
  const [currentTool, setCurrentTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(50);
  const [showMask, setShowMask] = useState(false);

  // Viewport State
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  // --- Refs ---
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const containerRef = useRef(null); // Reference to the wrapper div
  const crystalLayerRef = useRef(null);
  const maskLayerRef = useRef(null);
  const isDrawing = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // --- Global Event Listeners (Keyboard & Safety Release) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === "Space" && !e.repeat) {
        // Prevent "Page Down" scrolling
        e.preventDefault(); 
        setIsSpaceHeld(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "Space") {
        setIsSpaceHeld(false);
        setIsPanning(false); // Stop panning immediately if space is released
      }
    };

    // Catch mouse release ANYWHERE in the window to prevent "stuck" dragging
    const handleGlobalPointerUp = () => {
      setIsPanning(false);
      isDrawing.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointerup", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, []);

  // --- Initialization ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        crystalLayerRef.current = null;
        maskLayerRef.current = null;
        setViewport({ scale: 1, x: 0, y: 0 });
      };
      reader.readAsDataURL(file);
    }
  };

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

  // --- Core Processing ---
  const handleGenerate = () => {
    if (!imgRef.current || !canvasRef.current) return;
    setIsProcessing(true);
    setTimeout(() => {
      crystalLayerRef.current = generateCrystalLayer(imgRef.current, density);
      triggerRender();
      setIsProcessing(false);
    }, 50);
  };

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

  const triggerRender = () => {
    if (!imgRef.current || !maskLayerRef.current || !canvasRef.current) return;
    renderComposite(
      canvasRef.current,
      crystalLayerRef.current,
      imgRef.current,
      maskLayerRef.current,
      showMask
    );
  };

  useEffect(() => { triggerRender(); }, [showMask]);

  // --- Navigation Logic (Zoom to Mouse) ---
  const handleWheel = (e) => {
    if (!imageSrc || !containerRef.current) return;
    e.preventDefault();

    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = direction > 0 ? (1 + zoomIntensity) : (1 / (1 + zoomIntensity));
    
    // Clamp zoom levels (0.1x to 20x)
    const newScale = Math.min(Math.max(0.1, viewport.scale * factor), 20);
    
    // Calculate Mouse Position relative to the container
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom Math: Keep the point under the mouse stationary
    // Formula: new_offset = mouse - (mouse - old_offset) * (new_scale / old_scale)
    const newX = mouseX - (mouseX - viewport.x) * (newScale / viewport.scale);
    const newY = mouseY - (mouseY - viewport.y) * (newScale / viewport.scale);

    setViewport({
      scale: newScale,
      x: newX,
      y: newY
    });
  };

  const handleFitView = () => {
    if (!imgRef.current || !containerRef.current) return;
    // Fit to 80% of container
    const rect = containerRef.current.getBoundingClientRect();
    const w = imgRef.current.naturalWidth;
    const h = imgRef.current.naturalHeight;
    const scale = Math.min(rect.width / w, rect.height / h) * 0.8;
    
    // Center it
    const x = (rect.width - w * scale) / 2;
    const y = (rect.height - h * scale) / 2;

    setViewport({ scale, x, y });
  };

  // --- Input Controller ---
  const onPointerDown = (e) => {
    // Middle Mouse (1) OR Left Mouse (0) while Space is held
    if (e.button === 1 || (e.button === 0 && isSpaceHeld)) {
      e.preventDefault(); 
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Left Mouse (0) for Painting
    if (e.button === 0 && activeTab === 'masking' && !isSpaceHeld) {
      isDrawing.current = true;
      const { x, y } = getPointerPos(e);
      paint(x, y);
    }
  };

  const onPointerMove = (e) => {
    // PANNING
    if (isPanning) {
      const deltaX = e.clientX - lastMousePos.current.x;
      const deltaY = e.clientY - lastMousePos.current.y;
      setViewport(prev => ({ ...prev, x: prev.x + deltaX, y: prev.y + deltaY }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // PAINTING
    if (isDrawing.current && activeTab === 'masking' && !isSpaceHeld) {
      const { x, y } = getPointerPos(e);
      paint(x, y);
    }
  };

  // --- Coordinate Mapping ---
  const getPointerPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    // Map CSS pixels -> Internal Canvas pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: cssX * scaleX,
      y: cssY * scaleY
    };
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

  // Cursor Management
  const getCursor = () => {
    if (isPanning || isSpaceHeld) return 'cursor-grab active:cursor-grabbing';
    if (activeTab === 'masking') return 'cursor-crosshair';
    return 'cursor-default';
  };

  return (
    <div className="flex h-screen w-full bg-bg text-white overflow-hidden">
      
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
                    <p className="text-sm text-gray-400">Upload Image</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Cell Density</label>
              <input type="range" min="500" max="20000" step="100" value={density} onChange={(e) => setDensity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-accent" />
            </div>
            <button onClick={handleGenerate} disabled={!imageSrc || isProcessing} className="w-full py-3 px-4 rounded-md font-bold text-white bg-accent hover:bg-accentHover shadow-lg">
              {isProcessing ? 'Processing...' : 'Generate Crystals'}
            </button>
          </div>
        )}

        {/* TAB: MASKING */}
        {activeTab === 'masking' && (
          <div className="space-y-6">
            <button 
              onClick={handleMagicSelect}
              disabled={isAnalyzing}
              className={`w-full py-3 px-4 rounded-md font-bold text-white shadow-lg flex items-center justify-center gap-2 transition ${isAnalyzing ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
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
        // Disable context menu on right click to keep UI clean
        onContextMenu={(e) => e.preventDefault()}
      >
        
        {/* Navigation Controls */}
        <div className="absolute top-4 right-4 z-50 flex gap-2 bg-panel/80 p-2 rounded-lg border border-gray-700 backdrop-blur-sm">
            <button onClick={handleFitView} className="p-2 hover:bg-gray-600 rounded text-gray-300" title="Reset View">
                <RotateCcw size={20} />
            </button>
            <div className="px-2 py-1 text-xs font-mono text-gray-400 flex items-center border-l border-gray-600">
                {Math.round(viewport.scale * 100)}%
            </div>
        </div>

        {!imageSrc && <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none"><ImageIcon className="w-16 h-16 mb-4 opacity-20" /><p>No Image Loaded</p></div>}
        
        <img ref={imgRef} src={imageSrc} alt="" className="hidden" onLoad={onImageLoad} />

        {/* TRANSFORM CONTAINER */}
        <div 
            style={{ 
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0', 
                willChange: 'transform',
            }}
            className="inline-block origin-top-left"
        >
            <canvas 
              ref={canvasRef} 
              className={`shadow-2xl border border-gray-800 ${!imageSrc ? 'hidden' : 'block'}`}
            />
        </div>
      </div>
    </div>
  );
}

export default App;