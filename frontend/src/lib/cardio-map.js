// Web Mercator layout of a route in a W x H box, plus the OpenStreetMap tiles under it.
// Pure: RouteMap.jsx draws what this returns. Tiles are optional; the line works without them.
const TILE = 256
export const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`

const worldX = (lon, z) => (lon + 180) / 360 * TILE * 2 ** z
const worldY = (lat, z) => {
  const s = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z
}

/**
 * Fits `points` ([t, lat, lon, ...]) into width x height: the deepest zoom (<= maxZoom) at which the
 * whole route fits with `pad` px around it, the route as pixel coordinates, and the tiles covering the box.
 */
export function mapLayout(points, { width = 640, height = 400, pad = 28, maxZoom = 17 } = {}) {
  if (!points || points.length < 2) return null
  let z = maxZoom, box
  for (; z >= 0; z--) {
    const xs = points.map(p => worldX(p[2], z)), ys = points.map(p => worldY(p[1], z))
    box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
    if (box.x1 - box.x0 <= width - 2 * pad && box.y1 - box.y0 <= height - 2 * pad) break
  }
  z = Math.max(0, z)
  // Corner of the box in world pixels, centring the route.
  const left = (box.x0 + box.x1) / 2 - width / 2, top = (box.y0 + box.y1) / 2 - height / 2
  const n = 2 ** z, tiles = []
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      tiles.push({ x: tx * TILE - left, y: ty * TILE - top, url: TILE_URL(z, ((tx % n) + n) % n, ty) })
    }
  }
  const xy = p => [worldX(p[2], z) - left, worldY(p[1], z) - top]
  return { z, width, height, tiles, line: points.map(xy) }
}
