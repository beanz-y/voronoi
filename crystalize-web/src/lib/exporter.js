import JSZip from "jszip";
import { renderCrystalLayer } from "./crystalizer";

/**
 * Generates the requested variations and bundles them into a ZIP.
 */
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

        // FIX: API Mismatch
        // 1. We pass 'voronoiPoints' as 'existingPoints' inside the options object.
        // 2. We accept that it returns an object { layer, points }, so we extract 'layer'.
        const { layer: crystalLayer } = await renderCrystalLayer(originalImage, { 
            existingPoints: voronoiPoints, // Reuse the geometry
            showBorders: withBorder, 
            scale,
            // We pass relaxation:0 because the points are ALREADY relaxed/weighted
            relaxation: 0,
            detailBias: 0 
        });

        // 2. Draw Background (Crystals)
        ctx.drawImage(crystalLayer, 0, 0);

        // 3. Draw Foreground (Masked Original)
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

    // 1. Border + Masked
    if (options.bm) tasks.push(addToZip("Border_Masked.png", true, true));
    
    // 2. Border + Full (No Mask)
    if (options.bf) tasks.push(addToZip("Border_Full.png", true, false));

    // 3. No Border + Masked
    if (options.nm) tasks.push(addToZip("NoBorder_Masked.png", false, true));

    // 4. No Border + Full (No Mask)
    if (options.nf) tasks.push(addToZip("NoBorder_Full.png", false, false));

    // Run all tasks
    await Promise.all(tasks);

    // Generate Zip
    const content = await zip.generateAsync({ type: "blob" });
    
    // Trigger Download
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `Crystalize_Batch_${scale}x.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}