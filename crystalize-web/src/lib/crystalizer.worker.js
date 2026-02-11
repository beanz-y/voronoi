import { Delaunay } from "d3-delaunay";

// --- HELPER: Lloyd's Relaxation (Geometric / Honeycomb) ---
function getCentroid(polygon) {
    let area = 0;
    let x = 0;
    let y = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [x0, y0] = polygon[i];
        const [x1, y1] = polygon[j];
        const cross = x0 * y1 - x1 * y0;
        area += cross;
        x += (x0 + x1) * cross;
        y += (y0 + y1) * cross;
    }
    area *= 0.5;
    if (area === 0) return null;
    const factor = 1 / (6 * area);
    return { x: x * factor, y: y * factor };
}

// --- NEW HELPER: Smart Point Generation (Contrast Aware) ---
function generateWeightedPoints(width, height, count, imgData, bias) {
    const points = new Float64Array(count * 2);
    let added = 0;
    
    // Safety break to prevent infinite loops on blank images
    let attempts = 0;
    const maxAttempts = count * 100; 

    while (added < count && attempts < maxAttempts) {
        attempts++;
        
        // 1. Pick a random spot
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        
        // 2. Measure "Contrast/Edge Strength" at this spot
        // We compare this pixel to its right neighbor to detect edges
        const i = (y * width + x) * 4;
        const nextI = (y * width + Math.min(x + 1, width - 1)) * 4;
        
        // Simple Edge Detection: Difference in RGB values
        const diff = Math.abs(imgData[i] - imgData[nextI]) +
                     Math.abs(imgData[i+1] - imgData[nextI+1]) +
                     Math.abs(imgData[i+2] - imgData[nextI+2]);
        
        // Normalize diff (0.0 to 1.0). Max diff is 255*3 = 765.
        // We boost it slightly to make edges "pop"
        const edgeScore = Math.min(1, diff / 100); 
        
        // 3. The Decider
        // If bias is 0, we accept EVERYTHING (Random).
        // If bias is 1, we only accept if Math.random() < edgeScore.
        // We blend between "Always Accept" (1) and "Edge Score" (edgeScore)
        const threshold = (edgeScore * bias) + (1 - bias);
        
        if (Math.random() < threshold) {
            points[added * 2] = x;
            points[added * 2 + 1] = y;
            added++;
        }
    }
    
    // Fill remaining if we timed out (fallback to random)
    while (added < count) {
        points[added * 2] = Math.random() * width;
        points[added * 2 + 1] = Math.random() * height;
        added++;
    }

    return points;
}


self.onmessage = ({ data }) => {
    const { imgData, width, height, options } = data;
    // We now receive "count" instead of "points" if we are generating fresh
    const { 
        showBorders, 
        scale = 1, 
        relaxation = 0, 
        detailBias = 0, // 0 = Random, 1 = Stick to Edges
        pointCount = 5000,
        existingPoints = null // Pass this if we are just re-rendering (e.g. toggling borders)
    } = options;

    let points;

    // --- STEP 1: GENERATION ---
    if (existingPoints) {
        // Reuse existing geometry (fast re-render)
        points = new Float64Array(existingPoints);
    } else {
        // Generate NEW geometry
        if (detailBias > 0) {
            points = generateWeightedPoints(width, height, pointCount, imgData, detailBias);
        } else {
            // Fast Random (Legacy)
            points = new Float64Array(pointCount * 2);
            for (let i = 0; i < pointCount * 2; i += 2) {
                points[i] = Math.random() * width;
                points[i + 1] = Math.random() * height;
            }
        }
    }

    let delaunay = new Delaunay(points);
    let voronoi = delaunay.voronoi([0, 0, width, height]);

    // --- STEP 2: RELAXATION (Honeycomb Effect) ---
    // Note: Relaxation destroys Detail Snapping. 
    // If detailBias is high, you probably want low relaxation.
    if (relaxation > 0 && !existingPoints) {
        for (let k = 0; k < relaxation; k++) {
            const newPoints = new Float64Array(points.length);
            for (let i = 0; i < points.length / 2; i++) {
                const polygon = voronoi.cellPolygon(i);
                if (polygon) {
                    const centroid = getCentroid(polygon);
                    if (centroid) {
                        newPoints[i*2] = centroid.x;
                        newPoints[i*2+1] = centroid.y;
                    } else {
                        newPoints[i*2] = points[i*2];
                        newPoints[i*2+1] = points[i*2+1];
                    }
                } else {
                    newPoints[i*2] = points[i*2];
                    newPoints[i*2+1] = points[i*2+1];
                }
            }
            points = newPoints;
            delaunay = new Delaunay(points);
            voronoi = delaunay.voronoi([0, 0, width, height]);
        }
    }
    
    // --- STEP 3: COLOR ANALYSIS (Original Scale) ---
    const finalCount = points.length / 2;
    const rTotals = new Float64Array(finalCount);
    const gTotals = new Float64Array(finalCount);
    const bTotals = new Float64Array(finalCount);
    const cellPixelCounts = new Uint32Array(finalCount);

    let lastIndex = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellIndex = delaunay.find(x, y, lastIndex);
            lastIndex = cellIndex;
            const px = (y * width + x) * 4;
            rTotals[cellIndex] += imgData[px];
            gTotals[cellIndex] += imgData[px+1];
            bTotals[cellIndex] += imgData[px+2];
            cellPixelCounts[cellIndex]++;
        }
    }

    // --- STEP 4: RENDER (Target Scale) ---
    const targetWidth = width * scale;
    const targetHeight = height * scale;
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const avgArea = (width * height) / finalCount;
    const avgRadius = Math.sqrt(avgArea / Math.PI);
    const strokeWidth = Math.max(1, Math.floor(avgRadius * 0.15));

    for (let i = 0; i < finalCount; i++) {
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
    self.postMessage({ resultBitmap, points }, [resultBitmap]);
};