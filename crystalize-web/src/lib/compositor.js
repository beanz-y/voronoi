/**
 * Combines the layers into the final visible canvas.
 */
export function renderComposite(
    destinationCanvas,
    crystalLayer,
    originalImage,
    maskLayer,
    showMaskOverlay
) {
    if (!destinationCanvas || !originalImage) return;

    const width = destinationCanvas.width;
    const height = destinationCanvas.height;
    const ctx = destinationCanvas.getContext("2d");

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Background
    if (crystalLayer) {
        // Case A: Crystals exist. Draw them normally.
        ctx.drawImage(crystalLayer, 0, 0);
    } else {
        // Case B: Pre-generation.
        // Draw the original image "Dimmed" to represent the "Future Crystal Area".
        // This allows verification of the image, while keeping the Mask (Bright) visible.
        ctx.save();
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 0.3; // Dim to 30% brightness
        ctx.drawImage(originalImage, 0, 0);
        ctx.restore();
    }

    // 2. Draw Foreground (Original Image + Mask)
    if (maskLayer) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw Mask (White shape)
        tempCtx.drawImage(maskLayer, 0, 0);

        // Keep Source (Original Image) only where Mask exists
        tempCtx.globalCompositeOperation = 'source-in';
        tempCtx.drawImage(originalImage, 0, 0);

        // Draw result to main screen
        ctx.drawImage(tempCanvas, 0, 0);
    }

    // 3. Draw Red Mask Overlay
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