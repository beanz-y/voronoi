import { Delaunay } from "d3-delaunay";

self.onmessage = ({ data }) => {
    const { imgData, width, height, points, options } = data;
    const { showBorders, scale = 1 } = options;
    
    // --- Phase 1: Analysis (Original Resolution) ---
    // We calculate colors based on the original 1:1 pixel data.
    // This is fast and accurate to the source.
    const pointCount = points.length / 2;
    const delaunay = new Delaunay(points);
    
    // Arrays to hold color totals
    const rTotals = new Float64Array(pointCount);
    const gTotals = new Float64Array(pointCount);
    const bTotals = new Float64Array(pointCount);
    const cellPixelCounts = new Uint32Array(pointCount);

    let lastIndex = 0;
    
    // Scan every pixel of the source image
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

    // --- Phase 2: Render (Target Resolution) ---
    // We create a canvas sized to the *Output* resolution.
    const targetWidth = width * scale;
    const targetHeight = height * scale;
    
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');

    // MAGIC: We scale the context. 
    // This allows us to use the original point coordinates, 
    // but the canvas draws them larger.
    ctx.scale(scale, scale);

    // Re-initialize Voronoi for rendering
    // Bounds are still relative to the original coordinates
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // Calculate Border Width (relative to original size)
    const avgArea = (width * height) / pointCount;
    const avgRadius = Math.sqrt(avgArea / Math.PI);
    const strokeWidth = Math.max(1, Math.floor(avgRadius * 0.15));

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

        // Anti-aliasing seam fix (scaled automatically by ctx.scale)
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; 
        ctx.stroke();
    }

    if (showBorders) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = "black";
        ctx.lineJoin = "round";
        ctx.beginPath();
        voronoi.render(ctx);
        ctx.stroke();
    }

    const resultBitmap = canvas.transferToImageBitmap();
    self.postMessage({ resultBitmap }, [resultBitmap]);
};