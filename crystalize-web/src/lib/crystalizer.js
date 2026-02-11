import { Delaunay } from "d3-delaunay";

/**
 * Generates the crystalized version of the image using Voronoi diagrams.
 * * @param {HTMLImageElement} imgElement - The source image
 * @param {number} pointCount - Density of crystals (e.g., 2500)
 * @param {HTMLCanvasElement} canvas - The target canvas to draw on
 */
export function generateCrystals(imgElement, pointCount, canvas) {
    const width = imgElement.naturalWidth;
    const height = imgElement.naturalHeight;

    // 1. Resize canvas to match image
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // 2. Draw original image to memory to sample colors
    // We create a temporary offscreen canvas to read pixel data efficiently
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(imgElement, 0, 0);
    
    // Get all pixel data at once (Optimization: vastly faster than getPixel per loop)
    const imgData = tempCtx.getImageData(0, 0, width, height).data;

    // 3. Generate Random Points
    // Equivalent to your Python: points = [[random.uniform(0, base_w), ...]]
    const points = new Float64Array(pointCount * 2);
    for (let i = 0; i < pointCount * 2; i += 2) {
        points[i] = Math.random() * width;     // x
        points[i + 1] = Math.random() * height; // y
    }

    // 4. Compute Voronoi Diagram (D3-Delaunay)
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // 5. Render Cells
    ctx.clearRect(0, 0, width, height);
    
    // Iterate over every cell
    for (let i = 0; i < pointCount; i++) {
        // Get the centroid (seed point) of the cell
        const cx = Math.floor(points[i * 2]);
        const cy = Math.floor(points[i * 2 + 1]);

        // Boundary check
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

        // Sample color from the original image at the seed point
        // Index = (y * width + x) * 4 (RGBA)
        const index = (cy * width + cx) * 4;
        const r = imgData[index];
        const g = imgData[index + 1];
        const b = imgData[index + 2];

        ctx.beginPath();
        voronoi.renderCell(i, ctx);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        
        // Optional: Stroke for "Internal Borders" (We can toggle this later via props)
        // ctx.strokeStyle = "rgba(0,0,0,0.1)";
        // ctx.stroke();
    }
}