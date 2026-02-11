import CrystalizerWorker from './crystalizer.worker.js?worker';

export function generateVoronoiPoints(width, height, count) {
    const points = new Float64Array(count * 2);
    for (let i = 0; i < count * 2; i += 2) {
        points[i] = Math.random() * width;
        points[i + 1] = Math.random() * height;
    }
    return points;
}

export async function renderCrystalLayer(imgElement, points, options = {}) {
    return new Promise((resolve, reject) => {
        const { scale = 1 } = options;
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
            const { resultBitmap } = e.data;
            
            // Create result canvas at TARGET (SCALED) size
            const resultCanvas = document.createElement('canvas');
            resultCanvas.width = width * scale;
            resultCanvas.height = height * scale;
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(resultBitmap, 0, 0);

            worker.terminate();
            resolve(resultCanvas);
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
            points,
            options // scale is passed here
        });
    });
}