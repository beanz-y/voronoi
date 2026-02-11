import { Delaunay } from "d3-delaunay";

/**
 * Generates the crystalized version of the image.
 * Returns an Offscreen Canvas containing the result.
 */
export function generateCrystalLayer(imgElement, pointCount) {
    const width = imgElement.naturalWidth;
    const height = imgElement.naturalHeight;

    // Create a standalone canvas for the crystal layer
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const ctx = layer.getContext("2d");

    // 1. Draw original to temp to sample colors
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(imgElement, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, width, height).data;

    // 2. Generate Points
    const points = new Float64Array(pointCount * 2);
    for (let i = 0; i < pointCount * 2; i += 2) {
        points[i] = Math.random() * width;
        points[i + 1] = Math.random() * height;
    }

    // 3. Voronoi
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // 4. Render
    ctx.clearRect(0, 0, width, height);
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
        
        // Optional: internal borders could be added here later
    }

    return layer;
}