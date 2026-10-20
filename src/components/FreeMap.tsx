"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, CLASS_KEYS } from "@/i18n";
import type { ClassKey } from "@/i18n";

// Street-level map built from public/data/streets_map.geojson (one merged,
// simplified shape per street, copied from the sister project Toronto Open
// Street Parking, with each street's parking class added by
// scripts/build_data.py). Hand-rolled SVG overlay over Esri World Street
// Map tiles (keyless), Web Mercator math. Pointer gestures: one finger or
// mouse drag pans, two-finger pinch zooms (fractional zoom, tiles are
// drawn from the nearest integer tile zoom and scaled), buttons zoom in
// steps. Selecting a street fits the map to that street's full shape.

interface MapProps {
  street: string;
  norm: string;
  cls: ClassKey;
}

interface MapFeature {
  properties: MapProps;
  geometry: { type: string; coordinates: number[][][] };
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

interface View {
  z: number;
  cx: number;
  cy: number;
}

const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile";

export const CLASS_COLOURS: Record<ClassKey, string> = {
  free: "#2e7d32",
  norule: "#7fa6c4",
  nofree: "#b23a2e",
  winter: "#7d5ba6",
};

const MIN_Z = 10;
const MAX_Z = 17;

function worldSize(z: number) {
  return 256 * Math.pow(2, z);
}

function xOf(lon: number, z: number) {
  return ((lon + 180) / 360) * worldSize(z);
}

function yOf(lat: number, z: number) {
  const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(z);
}

function lonOf(x: number, z: number) {
  return (x / worldSize(z)) * 360 - 180;
}

function latOf(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function fmt(n: number) {
  return n.toLocaleString("en-CA");
}

function distToSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function cityView(w: number): View {
  const z = w < 720 ? 10 : 11;
  return { z, cx: xOf(-79.383, z), cy: yOf(43.705, z) };
}

// Zoom and centre so the street's whole shape fills the view, with padding.
function fitViewFor(f: MapFeature, w: number, h: number): View {
  const [minLon, minLat, maxLon, maxLat] = f.bbox;
  const pad = Math.max(20, Math.min(56, w * 0.07));
  const w0 = ((maxLon - minLon) / 360) * 256;
  const h0 = Math.abs(yOf(maxLat, 0) - yOf(minLat, 0));
  let z = 16;
  if (w0 > 0.01 || h0 > 0.01) {
    const zx = w0 > 0.01 ? Math.log2(Math.max(1, w - 2 * pad) / w0) : Infinity;
    const zy = h0 > 0.01 ? Math.log2(Math.max(1, h - 2 * pad) / h0) : Infinity;
    z = Math.max(MIN_Z, Math.min(MAX_Z, Math.min(zx, zy)));
  }
  return {
    z,
    cx: xOf((minLon + maxLon) / 2, z),
    cy: (yOf(minLat, z) + yOf(maxLat, z)) / 2,
  };
}

interface Gesture {
  mode: "pan" | "pinch";
  startX: number;
  startY: number;
  startDist: number;
  startMidX: number;
  startMidY: number;
  moved: number;
}

interface Tf {
  dx: number;
  dy: number;
  s: number;
  ox: number;
  oy: number;
}

export default function FreeMap({
  selectedNorm,
  onPick,
  onReset,
  focusPos,
}: {
  selectedNorm: string | null;
  onPick: (norm: string) => void;
  onReset?: () => void;
  focusPos?: { lat: number; lon: number } | null;
}) {
  const { t } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const [features, setFeatures] = useState<MapFeature[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  const [tf, setTf] = useState<Tf | null>(null);
  const tfRef = useRef<Tf | null>(null);
  tfRef.current = tf;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  // True once a gesture has had two pointers down: the last finger lifting
  // at the end of a pinch must not be read as a tap.
  const multiTouch = useRef(false);
  const lastFitNorm = useRef<string | null>(null);

  // Measure the container.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const s = { w: el.clientWidth, h: el.clientHeight };
      sizeRef.current = s;
      setSize(s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the street shapes once.
  useEffect(() => {
    fetch("/data/streets_map.geojson")
      .then((r) => r.json())
      .then((fc) => {
        const feats: MapFeature[] = (fc.features ?? []).map(
          (f: { properties: MapProps; geometry: MapFeature["geometry"] }) => {
            let minLon = 999, minLat = 999, maxLon = -999, maxLat = -999;
            for (const line of f.geometry.coordinates)
              for (const pt of line) {
                if (pt[0] < minLon) minLon = pt[0];
                if (pt[0] > maxLon) maxLon = pt[0];
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
              }
            return { ...f, bbox: [minLon, minLat, maxLon, maxLat] as [number, number, number, number] };
          }
        );
        setFeatures(feats);
      })
      .catch(() => setFeatures([]));
  }, []);

  // Street counts per class, for the legend.
  useEffect(() => {
    fetch("/api/v1/parking/summary")
      .then((r) => r.json())
      .then((s) => {
        const c: Record<string, number> = {};
        for (const k of CLASS_KEYS) c[k] = s?.classes?.[k]?.streets ?? 0;
        setCounts(c);
      })
      .catch(() => {});
  }, []);

  // Initial view: fit Toronto.
  useEffect(() => {
    if (view || size.w === 0) return;
    setView(cityView(size.w));
  }, [size, view]);

  // Selection drives the map: fit to the selected street's full shape.
  // Clearing the selection (after one was set) returns to the whole city.
  useEffect(() => {
    if (!features) return;
    if (selectedNorm) {
      if (lastFitNorm.current === selectedNorm) return;
      const f = features.find((x) => x.properties.norm === selectedNorm);
      if (!f || sizeRef.current.w === 0) return;
      lastFitNorm.current = selectedNorm;
      setView(fitViewFor(f, sizeRef.current.w, sizeRef.current.h));
    } else if (lastFitNorm.current !== null) {
      lastFitNorm.current = null;
      if (sizeRef.current.w > 0) setView(cityView(sizeRef.current.w));
    }
  }, [features, selectedNorm]);

  // "Near me": centre on the visitor at street level when a position arrives.
  useEffect(() => {
    if (!focusPos) return;
    const z = 15;
    setView({ z, cx: xOf(focusPos.lon, z), cy: yOf(focusPos.lat, z) });
  }, [focusPos]);

  // The visitor's marker, in the same screen coordinates as the street paths.
  const marker = useMemo(() => {
    if (!focusPos || !view) return null;
    const sx = xOf(focusPos.lon, view.z) - (view.cx - size.w / 2);
    const sy = yOf(focusPos.lat, view.z) - (view.cy - size.h / 2);
    if (sx < -30 || sy < -30 || sx > size.w + 30 || sy > size.h + 30) return null;
    return { sx, sy };
  }, [focusPos, view, size]);

  const visible = useMemo(() => {
    if (!view) return null;
    const tlx = view.cx - size.w / 2;
    const tly = view.cy - size.h / 2;
    return {
      tlx,
      tly,
      minLon: lonOf(tlx, view.z),
      maxLon: lonOf(tlx + size.w, view.z),
      minLat: latOf(tly + size.h, view.z),
      maxLat: latOf(tly, view.z),
    };
  }, [view, size]);

  // One path per class colour (fast), built from visible streets only.
  const classPaths = useMemo(() => {
    if (!features || !visible || !view) return [] as { colour: string; d: string }[];
    const byColour = new Map<string, string[]>();
    for (const f of features) {
      const [a, b, c, d] = f.bbox;
      if (c < visible.minLon || a > visible.maxLon || d < visible.minLat || b > visible.maxLat) continue;
      const colour = CLASS_COLOURS[f.properties.cls] ?? "#999999";
      const parts: string[] = [];
      for (const line of f.geometry.coordinates) {
        line.forEach((pt, i) => {
          const sx = xOf(pt[0], view.z) - visible.tlx;
          const sy = yOf(pt[1], view.z) - visible.tly;
          parts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
        });
      }
      const arr = byColour.get(colour) ?? [];
      arr.push(parts.join(" "));
      byColour.set(colour, arr);
    }
    return [...byColour.entries()].map(([colour, ds]) => ({ colour, d: ds.join(" ") }));
  }, [features, visible, view]);

  const selectedInfo = useMemo(() => {
    if (!features || !visible || !view || !selectedNorm) return null;
    const f = features.find((x) => x.properties.norm === selectedNorm);
    if (!f) return null;
    const parts: string[] = [];
    for (const line of f.geometry.coordinates) {
      line.forEach((pt, i) => {
        const sx = xOf(pt[0], view.z) - visible.tlx;
        const sy = yOf(pt[1], view.z) - visible.tly;
        parts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
      });
    }
    return { d: parts.join(" "), colour: CLASS_COLOURS[f.properties.cls] ?? "#1a1a1a" };
  }, [features, visible, view, selectedNorm]);

  // Tiles come from the nearest integer zoom and are scaled to the exact
  // (possibly fractional) view zoom, so pinch zoom stays smooth.
  const tiles = useMemo(() => {
    if (!view) return [] as { key: string; src: string; left: number; top: number; px: number }[];
    const zt = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(view.z)));
    const px = 256 * Math.pow(2, view.z - zt);
    const tlx = view.cx - size.w / 2;
    const tly = view.cy - size.h / 2;
    const maxTile = Math.pow(2, zt) - 1;
    const i0 = Math.max(0, Math.floor(tlx / px) - 1);
    const i1 = Math.min(maxTile, Math.floor((tlx + size.w) / px) + 1);
    const j0 = Math.max(0, Math.floor(tly / px) - 1);
    const j1 = Math.min(maxTile, Math.floor((tly + size.h) / px) + 1);
    const out: { key: string; src: string; left: number; top: number; px: number }[] = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        out.push({
          key: `${zt}-${i}-${j}`,
          src: `${TILE_URL}/${zt}/${j}/${i}`,
          left: i * px - tlx,
          top: j * px - tly,
          px,
        });
    return out;
  }, [view, size]);

  function zoom(delta: number) {
    const v = viewRef.current;
    if (!v) return;
    const z = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(v.z) + delta));
    if (z === v.z) return;
    const k = Math.pow(2, z - v.z);
    setView({ z, cx: v.cx * k, cy: v.cy * k });
  }

  // Commit the on-screen gesture transform into the view state, keeping the
  // world point under the gesture's focal point fixed on screen.
  function commitTf(tfNow: Tf | null) {
    const v = viewRef.current;
    setTf(null);
    tfRef.current = null;
    if (!v || !tfNow) return;
    if (Math.abs(tfNow.dx) < 0.5 && Math.abs(tfNow.dy) < 0.5 && Math.abs(tfNow.s - 1) < 0.01) return;
    const { w, h } = sizeRef.current;
    if (w === 0) return;
    const z2 = Math.max(MIN_Z, Math.min(MAX_Z, v.z + Math.log2(tfNow.s)));
    const k = Math.pow(2, z2 - v.z);
    const tlx = v.cx - w / 2;
    const tly = v.cy - h / 2;
    // World point (at the old zoom) displayed at the focal point now.
    const wx = tlx + tfNow.ox - tfNow.dx / tfNow.s;
    const wy = tly + tfNow.oy - tfNow.dy / tfNow.s;
    setView({
      z: z2,
      cx: wx * k - tfNow.ox + w / 2,
      cy: wy * k - tfNow.oy + h / 2,
    });
  }

  function localPos(e: React.PointerEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }

  function startPan(pos: { x: number; y: number }) {
    gesture.current = {
      mode: "pan",
      startX: pos.x,
      startY: pos.y,
      startDist: 0,
      startMidX: pos.x,
      startMidY: pos.y,
      moved: 0,
    };
    setTf({ dx: 0, dy: 0, s: 1, ox: pos.x, oy: pos.y });
  }

  function startPinch() {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    gesture.current = {
      mode: "pinch",
      startX: mid.x,
      startY: mid.y,
      startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      startMidX: mid.x,
      startMidY: mid.y,
      moved: 99,
    };
    setTf({ dx: 0, dy: 0, s: 1, ox: mid.x, oy: mid.y });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const pos = localPos(e);
    pointers.current.set(e.pointerId, pos);
    if (pointers.current.size === 1) {
      startPan(pos);
    } else if (pointers.current.size === 2) {
      multiTouch.current = true;
      commitTf(tfRef.current);
      startPinch();
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    const pos = localPos(e);
    pointers.current.set(e.pointerId, pos);
    if (g.mode === "pan" && pointers.current.size === 1) {
      const dx = pos.x - g.startX;
      const dy = pos.y - g.startY;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      setTf({ dx, dy, s: 1, ox: g.startX, oy: g.startY });
    } else if (g.mode === "pinch" && pointers.current.size >= 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const s = g.startDist > 0 ? Math.max(0.3, Math.min(4, dist / g.startDist)) : 1;
      setTf({ dx: mid.x - g.startMidX, dy: mid.y - g.startMidY, s, ox: g.startMidX, oy: g.startMidY });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    const wasTap =
      g?.mode === "pan" && g.moved < 6 && pointers.current.size === 1 && !multiTouch.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) multiTouch.current = false;
    if (pointers.current.size === 1 && g?.mode === "pinch") {
      // One finger lifted mid-pinch: settle the zoom, then keep panning
      // with the finger that is still down.
      commitTf(tfRef.current);
      const rest = [...pointers.current.values()][0];
      startPan(rest);
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (wasTap) {
      setTf(null);
      tfRef.current = null;
      hitTest(e);
      return;
    }
    commitTf(tfRef.current);
  }

  function hitTest(e: React.PointerEvent) {
    const v = viewRef.current;
    if (!v || !features) return;
    const { x: sx, y: sy } = localPos(e);
    const wx = v.cx - size.w / 2 + sx;
    const wy = v.cy - size.h / 2 + sy;
    const lon = lonOf(wx, v.z);
    const lat = latOf(wy, v.z);
    const tolPx = e.pointerType === "touch" ? 22 : 14;
    const tolDeg = (tolPx / worldSize(v.z)) * 360;
    let best: { norm: string; d: number } | null = null;
    for (const f of features) {
      const [a, b, c, d] = f.bbox;
      if (lon < a - tolDeg || lon > c + tolDeg || lat < b - tolDeg || lat > d + tolDeg) continue;
      for (const line of f.geometry.coordinates) {
        for (let i = 0; i + 1 < line.length; i++) {
          const dist = distToSegment(
            wx, wy,
            xOf(line[i][0], v.z), yOf(line[i][1], v.z),
            xOf(line[i + 1][0], v.z), yOf(line[i + 1][1], v.z)
          );
          if (dist <= tolPx && (!best || dist < best.d)) best = { norm: f.properties.norm, d: dist };
        }
      }
    }
    if (best) onPick(best.norm);
  }

  const stop = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  };

  return (
    <div id="map" className="scroll-mt-24">
      <h2 className="display max-w-[820px] text-[30px] md:text-[38px]">{t.map.title}</h2>
      <p className="mt-3 max-w-[760px] text-[16px] leading-relaxed text-ink/70">{t.map.hint}</p>

      <div
        ref={boxRef}
        data-testid="street-map"
        className="relative mt-4 h-[62vh] min-h-[380px] scroll-mt-3 touch-none select-none overflow-hidden rounded-[24px] border border-line bg-[#e8e4da] md:h-[560px] lg:h-[660px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label={t.map.title}
      >
        <div
          className="absolute inset-0"
          style={
            tf
              ? {
                  transform: `translate(${tf.dx}px, ${tf.dy}px) scale(${tf.s})`,
                  transformOrigin: `${tf.ox}px ${tf.oy}px`,
                }
              : undefined
          }
        >
          {tiles.map((tile) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute"
              style={{ left: tile.left, top: tile.top, width: tile.px, height: tile.px }}
            />
          ))}
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {classPaths.map((p) => (
              <path
                key={p.colour}
                d={p.d}
                fill="none"
                stroke={p.colour}
                strokeWidth={view && view.z >= 13 ? 2.4 : 1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {selectedInfo && (
              <>
                <path d={selectedInfo.d} fill="none" stroke="#ffffff" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
                <path d={selectedInfo.d} fill="none" stroke="#141414" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
                <path
                  data-testid="selected-path"
                  d={selectedInfo.d}
                  fill="none"
                  stroke={selectedInfo.colour}
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
            {marker && (
              <g pointerEvents="none">
                <circle cx={marker.sx} cy={marker.sy} r={13} fill="#d80621" fillOpacity={0.18} />
                <circle cx={marker.sx} cy={marker.sy} r={6.5} fill="#d80621" stroke="#ffffff" strokeWidth={2.5} />
              </g>
            )}
          </svg>
        </div>

        {selectedNorm && onReset && (
          <div className="absolute left-3 top-3" {...stop}>
            <button
              onClick={onReset}
              data-testid="show-city-button"
              className="flex h-11 items-center rounded-full border border-line bg-paper px-4 text-[14.5px] font-semibold shadow-sm hover:border-ink"
            >
              {t.map.showCity}
            </button>
          </div>
        )}

        <div className="absolute right-3 top-3 flex flex-col gap-2" {...stop}>
          <button
            onClick={() => zoom(1)}
            className="h-11 w-11 rounded-full border border-line bg-paper text-[22px] font-semibold leading-none shadow-sm hover:border-ink"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => zoom(-1)}
            className="h-11 w-11 rounded-full border border-line bg-paper text-[22px] font-semibold leading-none shadow-sm hover:border-ink"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        <div
          className="absolute bottom-3 left-3 max-w-[300px] rounded-[14px] border border-line bg-paper/95 px-4 py-3"
          {...stop}
        >
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink/55">{t.map.legendTitle}</p>
          <ul className="mt-2 space-y-1.5">
            {CLASS_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2 text-[13px] leading-snug text-ink/80">
                <span className="mt-[3px] inline-block h-[6px] w-6 shrink-0 rounded-full" style={{ background: CLASS_COLOURS[k] }} />
                <span>
                  {t.classNames[k]}
                  {counts ? (
                    <span className="text-ink/55 max-sm:hidden"> · {fmt(counts[k] ?? 0)} {t.streetsWord}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="absolute bottom-3 right-3 rounded-full bg-paper/85 px-3 py-1 text-[11.5px] text-ink/60" {...stop}>
          Basemap:{" "}
          <a href="https://www.esri.com" className="underline" target="_blank" rel="noreferrer">
            Esri
          </a>{" "}
          · ©{" "}
          <a href="https://www.openstreetmap.org/copyright" className="underline" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors
        </p>

        {!features && (
          <p className="absolute inset-0 flex items-center justify-center text-[15px] text-ink/60">
            {t.map.loading}
          </p>
        )}
      </div>
    </div>
  );
}
