// Distance math for the homepage "Near me" list.
//
// The visitor's position and every street shape from
// public/data/streets_map.geojson are projected onto a flat metre grid
// centred on the visitor (equirectangular projection: exact enough at
// street scale, and the error at 500 m is well under a metre). A street's
// distance is the smallest point-to-segment distance from the visitor to
// any part of the street's shape. Everything runs in the browser; the
// position never leaves it.

export interface StreetShape {
  street: string;
  norm: string;
  lines: number[][][]; // MultiLineString coordinates, [lon, lat] pairs
}

export interface NearbyStreet {
  street: string;
  norm: string;
  distanceM: number;
}

const M_PER_DEG_LAT = 110960;

function project(lon: number, lat: number, lon0: number, lat0: number, kx: number): [number, number] {
  return [(lon - lon0) * kx, (lat - lat0) * M_PER_DEG_LAT];
}

function pointToSegmentM(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Every street whose shape comes within radiusM of (lat, lon), nearest
// first. Street shapes whose bounding box misses the search box are
// skipped without measuring them.
export function findNearbyStreets(
  lat: number,
  lon: number,
  shapes: StreetShape[],
  radiusM = 500
): NearbyStreet[] {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLon = radiusM / kx;
  const out: NearbyStreet[] = [];
  for (const s of shapes) {
    let best = Infinity;
    for (const line of s.lines) {
      // Cheap bounding-box check per line before measuring segments.
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const pt of line) {
        if (pt[0] < minLon) minLon = pt[0];
        if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
      if (maxLon < lon - dLon || minLon > lon + dLon || maxLat < lat - dLat || minLat > lat + dLat) continue;
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, ay] = project(line[i][0], line[i][1], lon, lat, kx);
        const [bx, by] = project(line[i + 1][0], line[i + 1][1], lon, lat, kx);
        const d = pointToSegmentM(0, 0, ax, ay, bx, by);
        if (d < best) best = d;
      }
    }
    if (best <= radiusM) out.push({ street: s.street, norm: s.norm, distanceM: best });
  }
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out;
}
