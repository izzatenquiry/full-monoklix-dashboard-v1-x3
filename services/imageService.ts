/**
 * Crop image to target aspect ratio (9:16 for portrait, 16:9 for landscape)
 * Uses center crop to maintain focus on main subject
 */
export const cropImageToAspectRatio = async (
  imageBase64: string,
  targetAspectRatio: '9:16' | '16:9'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const width = img.width;
      const height = img.height;
      let cropX = 0;
      let cropY = 0;
      let cropWidth = width;
      let cropHeight = height;

      // Calculate target ratio
      const targetRatio = targetAspectRatio === '16:9' ? 16 / 9 : 9 / 16;
      const imgRatio = width / height;

      // Only crop if aspect ratio difference is significant (> 1%)
      if (Math.abs(imgRatio - targetRatio) > 0.01) {
        if (imgRatio > targetRatio) {
          // Image is wider than target, crop width (center crop horizontally)
          cropHeight = height;
          cropWidth = Math.round(cropHeight * targetRatio);
          cropX = Math.round((width - cropWidth) / 2);
          cropY = 0;
        } else {
          // Image is taller than target, crop height (center crop vertically)
          cropWidth = width;
          cropHeight = Math.round(cropWidth / targetRatio);
          cropX = 0;
          cropY = Math.round((height - cropHeight) / 2);
        }

        console.log(`Cropping image from ${width}x${height} to ${cropWidth}x${cropHeight} (${targetAspectRatio})`);
      }

      // Set canvas size to cropped dimensions
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      // Fill with white background (in case of transparency)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cropWidth, cropHeight);

      // Draw cropped image
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      // Convert to PNG with high quality
      const pngDataUrl = canvas.toDataURL('image/png', 1.0);

      // Extract base64 (remove data:image/png;base64, prefix)
      const base64 = pngDataUrl.split(',')[1];

      console.log(`Image processed: ${cropWidth}x${cropHeight}`);
      resolve(base64);
    };

    img.onerror = () => reject(new Error('Failed to load image for cropping'));

    // Handle both raw base64 and data URL formats
    img.src = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;
  });
};
