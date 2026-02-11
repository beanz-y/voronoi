import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Eraser, Brush, Eye } from 'lucide-react';
import { generateCrystalLayer } from './lib/crystalizer';
import { renderComposite } from './lib/compositor';
import { generateSubjectMask } from './lib/ai-mask';
import { Sparkles } from 'lucide-react'; // Add Sparkles icon

function App() {
  // --- State ---
  const [imageSrc, setImageSrc] = useState(null);
  const [density, setDensity] = useState(5000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('crystals');

  // Masking Settings
  const [currentTool, setCurrentTool] = useState('brush');
  const [brushSize, setBrushSize] = useState(50);
  const [showMask, setShowMask] = useState(false);

  // Auto Masking
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- Refs ---
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const crystalLayerRef = useRef(null);
  const maskLayerRef = useRef(null);
  const isDrawing = useRef(false);

  // --- Initialization ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        // Reset crystals, but we DO NOT reset the mask immediately if we want to support re-uploads? 
        // For now, let's reset everything for a fresh start.
        crystalLayerRef.current = null;
        maskLayerRef.current = null;
      };
      reader.readAsDataURL(file);
    }
  };

  // Called when the <img> tag actually finishes loading the source data
  const onImageLoad = () => {
    if (!imgRef.current || !canvasRef.current) return;

    // 1. Resize Canvas
    canvasRef.current.width = imgRef.current.naturalWidth;
    canvasRef.current.height = imgRef.current.naturalHeight;

    // 2. Initialize Empty Mask Layer
    const cvs = document.createElement('canvas');
    cvs.width = imgRef.current.naturalWidth;
    cvs.height = imgRef.current.naturalHeight;
    maskLayerRef.current = cvs;

    // 3. Trigger Initial Render (This will show the checkerboard + any mask)
    triggerRender();
  };

  // --- Generation Pipeline ---
  const handleGenerate = () => {
    if (!imgRef.current || !canvasRef.current) return;
    setIsProcessing(true);

    setTimeout(() => {
      // Generate Crystals
      crystalLayerRef.current = generateCrystalLayer(imgRef.current, density);
      // Render
      triggerRender();
      setIsProcessing(false);
    }, 50);
  };

  const triggerRender = () => {
    // Note: We no longer check for crystalLayerRef.current here, allowing pre-render
    if (!imgRef.current || !maskLayerRef.current || !canvasRef.current) return;

    renderComposite(
      canvasRef.current,
      crystalLayerRef.current, // Might be null
      imgRef.current,
      maskLayerRef.current,
      showMask
    );
  };

  // Re-render when toggles change
  useEffect(() => {
    triggerRender();
  }, [showMask]);

  // --- Drawing Logic (Unchanged from previous step, but included for completeness) ---
  const getPointerPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
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

  const onPointerDown = (e) => {
    if (activeTab !== 'masking') return;
    isDrawing.current = true;
    const { x, y } = getPointerPos(e);
    paint(x, y);
  };

  const onPointerMove = (e) => {
    if (!isDrawing.current || activeTab !== 'masking') return;
    const { x, y } = getPointerPos(e);
    paint(x, y);
  };

  const onPointerUp = () => {
    isDrawing.current = false;
  };

  // AUTO MASKING
  const handleMagicSelect = async () => {
    if (!imageSrc) return;

    setIsAnalyzing(true);

    // Give the UI a moment to show the spinner
    setTimeout(async () => {
      try {
        const subjectMask = await generateSubjectMask(imageSrc);

        if (!maskLayerRef.current) {
          maskLayerRef.current = subjectMask;
        } else {
          // Draw new subject on top of existing mask
          const ctx = maskLayerRef.current.getContext('2d');
          ctx.drawImage(subjectMask, 0, 0);
        }
        triggerRender();
      } catch (err) {
        console.error(err);
        alert("Could not detect subject. Please try manually.");
      }
      setIsAnalyzing(false);
    }, 50);
  };

  return (
    <div className="flex h-screen w-full bg-bg text-white overflow-hidden" onMouseUp={onPointerUp}>

      {/* SIDEBAR */}
      <div className="w-80 flex-shrink-0 bg-panel border-r border-gray-700 flex flex-col p-4 z-10">
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
              className={`w-full py-3 px-4 rounded-md font-bold text-white shadow-lg flex items-center justify-center gap-2 transition
    ${isAnalyzing ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isAnalyzing ? (
                <>
                  <span className="animate-spin text-xl">⟳</span>
                  <span>Analyzing Image...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Auto-Detect Subject</span>
                </>
              )}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCurrentTool('brush')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'brush' ? 'bg-accent border-accent' : 'bg-gray-800 border-gray-700'}`}><Brush size={20} /><span className="text-xs font-bold">Brush</span></button>
              <button onClick={() => setCurrentTool('eraser')} className={`p-3 rounded flex flex-col items-center gap-2 border ${currentTool === 'eraser' ? 'bg-red-500 border-red-500' : 'bg-gray-800 border-gray-700'}`}><Eraser size={20} /><span className="text-xs font-bold">Eraser</span></button>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300">Brush Size: {brushSize}px</label>
              <input type="range" min="10" max="300" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg accent-gray-400" />
            </div>
            <button onClick={() => setShowMask(!showMask)} className={`w-full py-2 px-4 rounded border flex items-center justify-center gap-2 transition ${showMask ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-gray-800 border-gray-700'}`}><Eye size={16} />{showMask ? "Hide Mask Overlay" : "Show Mask Overlay"}</button>
          </div>
        )}
      </div>

      {/* VIEWPORT */}
      <div className="flex-1 bg-[#111] relative flex items-center justify-center overflow-auto p-8">
        {!imageSrc && <div className="text-gray-500 flex flex-col items-center"><ImageIcon className="w-16 h-16 mb-4 opacity-20" /><p>No Image Loaded</p></div>}

        {/* Changed: onLoad now triggers onImageLoad instead of handleGenerate */}
        <img ref={imgRef} src={imageSrc} alt="" className="hidden" onLoad={onImageLoad} />

        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className={`max-w-full shadow-2xl border border-gray-800 ${!imageSrc ? 'hidden' : 'block'} ${activeTab === 'masking' ? 'cursor-crosshair' : 'cursor-default'}`}
        />
      </div>
    </div>
  );
}

export default App;