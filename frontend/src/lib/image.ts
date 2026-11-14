/** Суретті кішірейтіп JPEG-ке айналдырады (жылдам жүктеу және Gemini үшін). EXIF бағдарын ескереді. */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.86): Promise<Blob> {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas қолжетімсіз.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp.source, 0, 0, w, h);
  bmp.close();
  return canvasToBlob(canvas, quality);
}

/** Тарих үшін кішкентай JPEG data URL. */
export async function makeThumb(file: Blob, side = 160): Promise<string | null> {
  try {
    const small = await compressImage(file, side, 0.7);
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(small);
    });
  } catch {
    return null;
  }
}

interface Bmp { source: CanvasImageSource; width: number; height: number; close: () => void }

async function loadBitmap(file: Blob): Promise<Bmp> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: b, width: b.width, height: b.height, close: () => b.close() };
    } catch {
      /* төмендегі Image әдісіне өтеміз */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Суретті оқу мүмкін болмады.'));
      i.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Суретті сығу мүмкін болмады.'))), 'image/jpeg', quality);
  });
}

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
