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
 * Takes the existing points and draws the layer.
 * This allows us to toggle borders without changing the cell shapes.
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

    // Sample Colors
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(imgElement, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, width, height).data;

    // Compute Voronoi
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // Calculate Border Width
    const avgArea = (width * height) / pointCount;
    const avgRadius = Math.sqrt(avgArea / Math.PI);
    const strokeWidth = Math.max(1, Math.floor(avgRadius * 0.15));

    ctx.clearRect(0, 0, width, height);

    // Pass 1: Fill
    for (let i = 0; i < pointCount; i++) {
        const cx = Math.floor(points[i * 2]);
        const cy = Math.floor(points[i * 2 + 1]);
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

        const index = (cy * width + cx) * 4;
        const r = imgData[index];
        const g = imgData[index + 1];
        const b = imgData[index + 2];

        ctx.beginPath();
        voronoi.renderCell(i, ctx);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
    }

    // Pass 2: Borders (Conditional)
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