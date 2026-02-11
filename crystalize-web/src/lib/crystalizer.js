import { Delaunay } from "d3-delaunay";

/**
 * Step 1: Math
 * Generates the random seed points for the Voronoi diagram.
 */
export function generateVoronoiPoints(width, height, count) {
    const points = new Float64Array(count * 2);
    for (let i = 0; i < count * 2; i += 2) {
        points[i] = Math.random() * width;
        points[i + 1] = Math.random() * height;
    }
    return points;
}

/**
 * Step 2: Render
 * Takes the points and calculates the AVERAGE color of the pixels within each cell.
 */
export function renderCrystalLayer(imgElement, points, options = {}) {
    const { showBorders = true } = options;
    
    const width = imgElement.naturalWidth;
    const height = imgElement.naturalHeight;
    const pointCount = points.length / 2;

    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const ctx = layer.getContext("2d");

    // 1. Get raw pixel data from the image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(imgElement, 0, 0);
    // This gives us a massive array of [R, G, B, A, R, G, B, A...]
    const imgData = tempCtx.getImageData(0, 0, width, height).data;

    // 2. Compute Voronoi Geometry
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // 3. Calculate AVERAGE Color per Cell
    // We create arrays to hold the running totals for every cell
    const rTotals = new Float64Array(pointCount);
    const gTotals = new Float64Array(pointCount);
    const bTotals = new Float64Array(pointCount);
    const cellPixelCounts = new Uint32Array(pointCount);

    // PERFORMANCE CRITICAL LOOP
    // We scan every pixel in the image to assign it to a cell.
    // Optimization: 'lastIndex' acts as a hint. Since we scan sequentially,
    // the next pixel is usually in the same cell as the previous one.
    // This makes the lookup O(1) instead of O(log N).
    let lastIndex = 0;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Find which cell this pixel belongs to
            const cellIndex = delaunay.find(x, y, lastIndex);
            lastIndex = cellIndex;

            // Get the color of this pixel
            const pixelIndex = (y * width + x) * 4;
            
            // Accumulate
            rTotals[cellIndex] += imgData[pixelIndex];
            gTotals[cellIndex] += imgData[pixelIndex + 1];
            bTotals[cellIndex] += imgData[pixelIndex + 2];
            cellPixelCounts[cellIndex]++;
        }
    }

    // 4. Calculate Border Width
    const avgArea = (width * height) / pointCount;
    const avgRadius = Math.sqrt(avgArea / Math.PI);
    const strokeWidth = Math.max(1, Math.floor(avgRadius * 0.15));

    // 5. Render
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < pointCount; i++) {
        // Calculate Average
        const count = cellPixelCounts[i];
        if (count === 0) continue; // Should not happen for visible cells

        const r = Math.round(rTotals[i] / count);
        const g = Math.round(gTotals[i] / count);
        const b = Math.round(bTotals[i] / count);

        const color = `rgb(${r},${g},${b})`;

        ctx.beginPath();
        voronoi.renderCell(i, ctx);
        
        ctx.fillStyle = color;
        ctx.fill();

        // FIX: Stroke with the same color to fill anti-aliasing gaps (seams)
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; 
        ctx.stroke();
    }

    // Pass 2: Borders
    if (showBorders) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = "black";
        ctx.lineJoin = "round";
        ctx.beginPath();
        voronoi.render(ctx);
        ctx.stroke();
    }

    return layer;
}