import JSZip from "jszip";
import { renderCrystalLayer } from "./crystalizer";

/**
 * Generates the requested variations and bundles them into a ZIP.
 */
export async function runBatchExport(
    originalImage,
    voronoiPoints,
    maskLayer,
    options = {} // { bm: true, bf: true, ... }
) {
    const zip = new JSZip();
    const width = originalImage.naturalWidth;
    const height = originalImage.naturalHeight;

    // Helper: Create a composite canvas for a specific variation
    const createVariation = (withBorder, useMask) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // 1. Generate the Crystal Layer (With or Without Borders)
        // We reuse the EXISTING points so the geometry matches exactly.
        const crystalLayer = renderCrystalLayer(originalImage, voronoiPoints, { showBorders: withBorder });

        // 2. Draw Background (Crystals)
        ctx.drawImage(crystalLayer, 0, 0);

        // 3. Draw Foreground (Masked Original) - ONLY if useMask is true
        if (useMask && maskLayer) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');

            tempCtx.drawImage(maskLayer, 0, 0);
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.drawImage(originalImage, 0, 0);

            ctx.drawImage(tempCanvas, 0, 0);
        }

        return canvas;
    };

    // Helper: Convert canvas to Blob and add to Zip
    const addToZip = async (filename, withBorder, useMask) => {
        const canvas = createVariation(withBorder, useMask);
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
    link.download = "Crystalize_Batch.zip";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}