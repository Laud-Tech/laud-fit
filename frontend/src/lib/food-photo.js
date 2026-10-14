// A picture for a food you register: the chosen file, cropped square and shrunk to a small data URL
// that rides inside the food's document (a document is capped at 64 KiB on the server).
// Browser-only (canvas); the sizing rule is the part worth testing, so it is its own function.
export const PHOTO_MAX_CHARS = 40000

/** Source rectangle for a centred square crop of a w x h image. */
export const squareCrop = (w, h) => { const s = Math.min(w, h); return { sx: Math.round((w - s) / 2), sy: Math.round((h - s) / 2), s } }

export async function shrinkPhoto(file, size = 192) {
  const bmp = await createImageBitmap(file)
  const { sx, sy, s } = squareCrop(bmp.width, bmp.height)
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  cv.getContext('2d').drawImage(bmp, sx, sy, s, s, 0, 0, size, size)
  bmp.close?.()
  // WebP where the browser writes it, JPEG otherwise; lower quality until it fits.
  for (const q of [0.8, 0.6, 0.4, 0.25]) {
    const url = cv.toDataURL('image/webp', q)
    const ok = url.startsWith('data:image/webp') ? url : cv.toDataURL('image/jpeg', q)
    if (ok.length <= PHOTO_MAX_CHARS) return ok
  }
  return null
}
