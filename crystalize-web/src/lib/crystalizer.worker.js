import { Delaunay } from "d3-delaunay";

self.onmessage = ({ data }) => {
    const { imgData, width, height, points, options } = data;
    const { showBorders } = options;
    
    // We can't use DOM elements (Canvas) in a Worker easily, 
    // so we work purely with Pixel Arrays (Uint8ClampedArray).
    
    // 1. Compute Voronoi
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);
    const pointCount = points.length / 2;

    // 2. Scan Pixels for Color Averaging
    // (This is the loop that was freezing the UI)
    const rTotals = new Float64Array(pointCount);
    const gTotals = new Float64Array(pointCount);
    const bTotals = new Float64Array(pointCount);
    const cellPixelCounts = new Uint32Array(pointCount);

    let lastIndex = 0;
    
    // Scan every pixel
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellIndex = delaunay.find(x, y, lastIndex);
            lastIndex = cellIndex;

            const pixelIndex = (y * width + x) * 4;
            
            rTotals[cellIndex] += imgData[pixelIndex];
            gTotals[cellIndex] += imgData[pixelIndex + 1];
            bTotals[cellIndex] += imgData[pixelIndex + 2];
            cellPixelCounts[cellIndex]++;
        }
    }

    // 3. Prepare Output Buffers
    // We create a new pixel array for the resulting image
    const outputBuffer = new Uint8ClampedArray(imgData.length);
    
    // Pre-calculate colors per cell
    const cellColors = new Int32Array(pointCount); // Stores packed RGB
    
    for (let i = 0; i < pointCount; i++) {
        const count = cellPixelCounts[i];
        if (count === 0) continue;
        
        const r = Math.round(rTotals[i] / count);
        const g = Math.round(gTotals[i] / count);
        const b = Math.round(bTotals[i] / count);
        
        // Pack into 32-bit integer for easier handling, or just store objects
        // We'll just use the raw values in the next loop if needed, 
        // but to render the Voronoi shapes, we need a Canvas-like approach.
        
        // Since OffscreenCanvas support is good but not 100% everywhere for 2D context drawing of paths,
        // we will use OffscreenCanvas if available, or manual pixel filling.
        // For Voronoi shapes (polygons), OffscreenCanvas is MUCH faster/easier than manual rasterization.
    }

    // 4. Render using OffscreenCanvas (Standard in modern browsers / Workers)
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Calculate Border
    const avgArea = (width * height) / pointCount;
    const avgRadius = Math.sqrt(avgArea / Math.PI);
    const strokeWidth = Math.max(1, Math.floor(avgRadius * 0.15));

    // Draw Cells
    for (let i = 0; i < pointCount; i++) {
        const count = cellPixelCounts[i];
        if (count === 0) continue;

        const r = Math.round(rTotals[i] / count);
        const g = Math.round(gTotals[i] / count);
        const b = Math.round(bTotals[i] / count);
        const color = `rgb(${r},${g},${b})`;

        ctx.beginPath();
        voronoi.renderCell(i, ctx);
        ctx.fillStyle = color;
        ctx.fill();

        // Anti-aliasing fix
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Draw Borders
    if (showBorders) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = "black";
        ctx.lineJoin = "round";
        ctx.beginPath();
        voronoi.render(ctx);
        ctx.stroke();
    }

    // 5. Transfer Result back to Main Thread
    const resultBitmap = canvas.transferToImageBitmap();
    self.postMessage({ resultBitmap }, [resultBitmap]);
};