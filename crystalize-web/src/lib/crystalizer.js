// Import the worker using Vite's syntax
import CrystalizerWorker from './crystalizer.worker.js?worker';

/**
 * Step 1: Math (Synchronous, fast enough for main thread usually, but can be moved)
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
 * Step 2: Render (ASYNC - Uses Web Worker)
 */
export async function renderCrystalLayer(imgElement, points, options = {}) {
    return new Promise((resolve, reject) => {
        const width = imgElement.naturalWidth;
        const height = imgElement.naturalHeight;

        // 1. Extract Raw Data (Main Thread)
        // We must draw to a temp canvas to read pixels. 
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(imgElement, 0, 0);
        
        // Get the pixel buffer (This is a large array)
        const imgData = tempCtx.getImageData(0, 0, width, height).data;

        // 2. Initialize Worker
        const worker = new CrystalizerWorker();

        // 3. Handle Worker Response
        worker.onmessage = (e) => {
            const { resultBitmap } = e.data;
            
            // Convert Bitmap back to a standard Canvas for the app to use
            const resultCanvas = document.createElement('canvas');
            resultCanvas.width = width;
            resultCanvas.height = height;
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(resultBitmap, 0, 0);

            // Cleanup
            worker.terminate();
            resolve(resultCanvas);
        };

        worker.onerror = (err) => {
            console.error("Worker Error:", err);
            worker.terminate();
            reject(err);
        };

        // 4. Send Data to Worker
        // We transfer 'points' buffer if possible, but definitely just copy imgData for now
        // to keep logic simple.
        worker.postMessage({
            imgData, // The raw pixels
            width,
            height,
            points,  // The geometry
            options
        });
    });
}