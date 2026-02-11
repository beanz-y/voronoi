export function renderComposite(
    destinationCanvas,
    crystalLayer,
    originalImage,
    maskLayer,
    showMaskOverlay,
    viewOriginal // NEW FLAG
) {
    if (!destinationCanvas || !originalImage) return;

    const width = destinationCanvas.width;
    const height = destinationCanvas.height;
    const ctx = destinationCanvas.getContext("2d");

    ctx.clearRect(0, 0, width, height);

    // MODE A: View Original (Override)
    if (viewOriginal) {
        // 1. Draw Original Image
        ctx.drawImage(originalImage, 0, 0);

        // 2. NEW: If Overlay is requested, draw it on top
        if (showMaskOverlay && maskLayer) {
            const overlayCanvas = document.createElement('canvas');
            overlayCanvas.width = width;
            overlayCanvas.height = height;
            const oCtx = overlayCanvas.getContext('2d');

            oCtx.drawImage(maskLayer, 0, 0);
            oCtx.globalCompositeOperation = 'source-in';
            oCtx.fillStyle = 'rgba(255, 0, 0, 0.4)'; // Red tint
            oCtx.fillRect(0, 0, width, height);

            ctx.drawImage(overlayCanvas, 0, 0);
        }
        return;
    }

    // MODE B: Standard Composite
    
    // 1. Draw Background (Crystals or Dimmed Source)
    if (crystalLayer) {
        ctx.drawImage(crystalLayer, 0, 0);
    } else {
        // Pre-generation: Dimmed Original
        ctx.save();
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 0.3; 
        ctx.drawImage(originalImage, 0, 0);
        ctx.restore();
    }

    // 2. Draw Foreground (Masked Original)
    if (maskLayer) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.drawImage(maskLayer, 0, 0);
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.drawImage(originalImage, 0, 0);

        ctx.drawImage(tempCanvas, 0, 0);
    }

    // 3. Draw Overlay
    if (showMaskOverlay && maskLayer) {
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        const oCtx = overlayCanvas.getContext('2d');

        oCtx.drawImage(maskLayer, 0, 0);
        oCtx.globalCompositeOperation = 'source-in';
        oCtx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        oCtx.fillRect(0, 0, width, height);

        ctx.drawImage(overlayCanvas, 0, 0);
    }
}