import { removeBackground } from "@imgly/background-removal";

// Track if we've already warmed up the engine in this session
let isEngineWarm = false;

export async function generateSubjectMask(imageSrc) {
    try {
        const config = {
            // "medium" is more accurate, "small" is faster. 
            // We use auto to let the library decide based on device power.
            model: 'medium', 
            
            // Disable the verbose "Downloading..." logs in the console
            debug: false, 
            
            // Only show progress if it's the cold start
            progress: (key, current, total) => {
                if (!isEngineWarm) {
                    // We can log internally if needed, but we keep the UI clean
                    // console.log(`Initializing Engine: ${Math.round(current/total * 100)}%`);
                }
            }
        };

        // Run the detection
        const blob = await removeBackground(imageSrc, config);
        
        // Mark engine as warm for next time
        isEngineWarm = true;

        // Convert result to Bitmap
        const bitmap = await createImageBitmap(blob);
        const width = bitmap.width;
        const height = bitmap.height;

        // Create the White Mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const ctx = maskCanvas.getContext('2d');

        // Draw Subject
        ctx.drawImage(bitmap, 0, 0);

        // Convert Subject to Solid White
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        return maskCanvas;

    } catch (error) {
        console.error("Detection Error:", error);
        throw error;
    }
}