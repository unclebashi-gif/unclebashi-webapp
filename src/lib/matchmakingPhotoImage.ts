const MAX_EDGE = 1600;
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('This image could not be converted. Try another photo.'));
    }, 'image/webp', 0.82);
  });
}

export async function normalizeMatchmakingPhoto(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Choose a JPEG, PNG, or WebP image. HEIC photos are not supported yet.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This image could not be opened. Try exporting it as JPEG, PNG, or WebP.');
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const output = await canvasToWebp(canvas);
    if (output.type !== 'image/webp') throw new Error('This browser could not create a WebP image. Try a current browser.');
    if (output.size > MAX_BYTES) throw new Error('This photo is still larger than 3 MiB after resizing. Choose a smaller image.');
    return output;
  } finally {
    bitmap.close();
  }
}
