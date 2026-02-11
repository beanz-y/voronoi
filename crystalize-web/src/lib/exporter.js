import JSZip from "jszip";
import { renderCrystalLayer } from "./crystalizer";

export async function runBatchExport(
    originalImage,
    voronoiPoints,
    maskLayer,
    options = {} 
) {
    const { 
        scale = 1, 
        watermark = "" 
    } = options;

    const zip = new JSZip();
    const width = originalImage.naturalWidth;
    const height = originalImage.naturalHeight;
    
    const targetWidth = width * scale;
    const targetHeight = height * scale;

    const createVariation = async (withBorder, useMask) => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        // 1. Generate Crystal Layer (VECTOR UPSCALE)
        // The worker will return a canvas that is already targetWidth x targetHeight
        const crystalLayer = await renderCrystalLayer(originalImage, voronoiPoints, { showBorders: withBorder, scale });

        // 2. Draw Crystals
        ctx.drawImage(crystalLayer, 0, 0);

        // 3. Draw Foreground (RASTER UPSCALE)
        if (useMask && maskLayer) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            const tempCtx = tempCanvas.getContext('2d');

            // Draw mask scaled up
            tempCtx.drawImage(maskLayer, 0, 0, targetWidth, targetHeight);
            
            // Composite source image scaled up
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.drawImage(originalImage, 0, 0, targetWidth, targetHeight);

            ctx.drawImage(tempCanvas, 0, 0);
        }

        // 4. Apply Watermark
        if (watermark) {
            const fontSize = Math.max(24, Math.floor(targetWidth * 0.03));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
            ctx.textAlign = "right";
            ctx.textBaseline = "bottom";
            
            // Text Shadow
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            const padding = Math.floor(targetWidth * 0.02);
            ctx.fillText(watermark, targetWidth - padding, targetHeight - padding);
        }

        return canvas;
    };

    const addToZip = async (filename, withBorder, useMask) => {
        const canvas = await createVariation(withBorder, useMask);
        return new Promise(resolve => {
            canvas.toBlob(blob => {
                zip.file(filename, blob);
                resolve();
            }, 'image/png');
        });
    };

    const tasks = [];
    if (options.bm) tasks.push(addToZip("Border_Masked.png", true, true));
    if (options.bf) tasks.push(addToZip("Border_Full.png", true, false));
    if (options.nm) tasks.push(addToZip("NoBorder_Masked.png", false, true));
    if (options.nf) tasks.push(addToZip("NoBorder_Full.png", false, false));

    await Promise.all(tasks);

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `Crystalize_Batch_${scale}x.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}