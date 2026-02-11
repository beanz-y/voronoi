import CrystalizerWorker from './crystalizer.worker.js?worker';

// DEPRECATED: generateVoronoiPoints is now handled inside the worker 
// because it needs access to pixel data for Weighted generation.
export function generateVoronoiPoints() { return null; }

export async function renderCrystalLayer(imgElement, options = {}) {
    return new Promise((resolve, reject) => {
        const { 
            scale = 1, 
            pointCount = 5000, 
            detailBias = 0, 
            relaxation = 0,
            showBorders = true,
            existingPoints = null // Optional: Pass points to SKIP generation
        } = options;

        const width = imgElement.naturalWidth;
        const height = imgElement.naturalHeight;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(imgElement, 0, 0);
        const imgData = tempCtx.getImageData(0, 0, width, height).data;

        const worker = new CrystalizerWorker();

        worker.onmessage = (e) => {
            const { resultBitmap, points } = e.data;
            
            const resultCanvas = document.createElement('canvas');
            resultCanvas.width = width * scale;
            resultCanvas.height = height * scale;
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(resultBitmap, 0, 0);

            worker.terminate();
            resolve({ layer: resultCanvas, points });
        };

        worker.onerror = (err) => {
            console.error(err);
            worker.terminate();
            reject(err);
        };

        worker.postMessage({
            imgData,
            width,
            height,
            options: {
                showBorders,
                scale,
                pointCount,
                detailBias,
                relaxation,
                existingPoints
            }
        });
    });
}