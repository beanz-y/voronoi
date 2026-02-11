import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sliders, Image as ImageIcon, Download } from 'lucide-react';
import { generateCrystals } from './lib/crystalizer';

function App() {
  // --- State ---
  const [imageSrc, setImageSrc] = useState(null);
  const [density, setDensity] = useState(5000);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Refs ---
  const canvasRef = useRef(null);
  const imgRef = useRef(null); // Hidden image element for data source

  // --- Handlers ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = () => {
    if (!imgRef.current || !canvasRef.current) return;
    
    setIsProcessing(true);
    
    // Use setTimeout to allow the UI to update "Processing..." state
    // before the heavy math blocks the main thread.
    setTimeout(() => {
      generateCrystals(imgRef.current, density, canvasRef.current);
      setIsProcessing(false);
    }, 50);
  };

  // Auto-generate when image loads
  const onImageLoad = () => {
    handleGenerate();
  };

  return (
    <div className="flex h-screen w-full bg-bg text-white overflow-hidden">
      
      {/* --- SIDEBAR --- */}
      <div className="w-80 flex-shrink-0 bg-panel border-r border-gray-700 flex flex-col p-4">
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="text-accent">◆</span> Crystalize Web
        </h1>

        {/* File Input */}
        <div className="mb-8">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-800 transition">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-2 text-gray-400" />
              <p className="text-sm text-gray-400">Click to Upload Image</p>
            </div>
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
          </label>
        </div>

        {/* Controls */}
        <div className="space-y-6 flex-1">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">Cell Density</label>
              <span className="text-xs text-accent font-mono">{density.toLocaleString()}</span>
            </div>
            <input 
              type="range" 
              min="500" 
              max="20000" 
              step="100"
              value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
            />
          </div>

          <button 
            onClick={handleGenerate}
            disabled={!imageSrc || isProcessing}
            className={`w-full py-3 px-4 rounded-md font-bold text-white transition
              ${!imageSrc 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-accent hover:bg-accentHover shadow-lg shadow-green-900/20'
              }`}
          >
            {isProcessing ? 'Processing...' : 'Generate Crystals'}
          </button>
        </div>
        
        <div className="text-xs text-gray-500 mt-auto text-center">
          Phase 1 Alpha Build
        </div>
      </div>

      {/* --- VIEWPORT --- */}
      <div className="flex-1 bg-[#111] relative flex items-center justify-center overflow-auto p-8">
        {!imageSrc && (
          <div className="text-gray-500 flex flex-col items-center">
            <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
            <p>No Image Loaded</p>
          </div>
        )}

        {/* Hidden Source Image */}
        {imageSrc && (
          <img 
            ref={imgRef}
            src={imageSrc} 
            alt="Source" 
            className="hidden" 
            onLoad={onImageLoad}
          />
        )}

        {/* Rendering Canvas */}
        <canvas 
          ref={canvasRef} 
          className={`max-w-full max-h-full shadow-2xl border border-gray-800 ${!imageSrc ? 'hidden' : 'block'}`}
        />
      </div>
    </div>
  );
}

export default App;