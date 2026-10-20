"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, CLASS_KEYS } from "@/i18n";
import type { ClassKey } from "@/i18n";

// Street-level map built from public/data/streets_map.geojson (one merged,
// simplified shape per street, copied from the sister project Toronto Open
// Street Parking, with each street's parking class added by
// scripts/build_data.py). Hand-rolled SVG overlay over Esri World Street
// Map tiles (keyless), Web Mercator math, drag to pan, buttons to zoom.

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

const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile";

export const CLASS_COLOURS: Record<ClassKey, string> = {
  free: "#2e7d32",
  norule: "#7fa6c4",
  noparking: "#b23a2e",
  winter: "#7d5ba6",
};

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

export default function FreeMap({
  selectedNorm,
  onPick,
  focusPos,
}: {
  selectedNorm: string | null;
  onPick: (norm: string) => void;
  focusPos?: { lat: number; lon: number } | null;
}) {
  const { t } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 540 });
  const [features, setFeatures] = useState<MapFeature[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [view, setView] = useState<{ z: number; cx: number; cy: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const pointer = useRef<{ x: number; y: number; moved: number } | null>(null);

  // Measure the container.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
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
    const z = size.w < 720 ? 10 : 11;
    setView({ z, cx: xOf(-79.383, z), cy: yOf(43.705, z) });
  }, [size, view]);

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

  const selectedPath = useMemo(() => {
    if (!features || !visible || !view || !selectedNorm) return "";
    const f = features.find((x) => x.properties.norm === selectedNorm);
    if (!f) return "";
    const parts: string[] = [];
    for (const line of f.geometry.coordinates) {
      line.forEach((pt, i) => {
        const sx = xOf(pt[0], view.z) - visible.tlx;
        const sy = yOf(pt[1], view.z) - visible.tly;
        parts.push(`${i === 0 ? "M" : "L"}${sx.toFixed(1)},${sy.toFixed(1)}`);
      });
    }
    return parts.join(" ");
  }, [features, visible, view, selectedNorm]);

  const tiles = useMemo(() => {
    if (!view) return [] as { key: string; src: string; left: number; top: number }[];
    const z = view.z;
    const tlx = view.cx - size.w / 2;
    const tly = view.cy - size.h / 2;
    const i0 = Math.max(0, Math.floor(tlx / 256) - 1);
    const i1 = Math.min(Math.pow(2, z) - 1, Math.floor((tlx + size.w) / 256) + 1);
    const j0 = Math.max(0, Math.floor(tly / 256) - 1);
    const j1 = Math.min(Math.pow(2, z) - 1, Math.floor((tly + size.h) / 256) + 1);
    const out: { key: string; src: string; left: number; top: number }[] = [];
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        out.push({
          key: `${z}-${i}-${j}`,
          src: `${TILE_URL}/${z}/${j}/${i}`,
          left: i * 256 - tlx,
          top: j * 256 - tly,
        });
    return out;
  }, [view, size]);

  function zoom(delta: number) {
    if (!view) return;
    const z = Math.max(10, Math.min(17, view.z + delta));
    if (z === view.z) return;
    const k = Math.pow(2, z - view.z);
    setView({ z, cx: view.cx * k, cy: view.cy * k });
  }

  function onPointerDown(e: React.PointerEvent) {
    pointer.current = { x: e.clientX, y: e.clientY, moved: 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pointer.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.moved = Math.max(p.moved, Math.hypot(dx, dy));
    setDrag({ dx, dy });
  }

  function onPointerUp(e: React.PointerEvent) {
    const p = pointer.current;
    pointer.current = null;
    if (!p || !view) {
      setDrag(null);
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.moved >= 5) {
      setView((v) => (v ? { ...v, cx: v.cx - dx, cy: v.cy - dy } : v));
      setDrag(null);
      return;
    }
    setDrag(null);
    // Click: hit-test nearest street within ~14 px.
    if (!features) return;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = view.cx - size.w / 2 + sx;
    const wy = view.cy - size.h / 2 + sy;
    const lon = lonOf(wx, view.z);
    const lat = latOf(wy, view.z);
    const tolDeg = (14 / worldSize(view.z)) * 360;
    let best: { norm: string; d: number } | null = null;
    for (const f of features) {
      const [a, b, c, d] = f.bbox;
      if (lon < a - tolDeg || lon > c + tolDeg || lat < b - tolDeg || lat > d + tolDeg) continue;
      for (const line of f.geometry.coordinates) {
        for (let i = 0; i + 1 < line.length; i++) {
          const dist = distToSegment(
            wx, wy,
            xOf(line[i][0], view.z), yOf(line[i][1], view.z),
            xOf(line[i + 1][0], view.z), yOf(line[i + 1][1], view.z)
          );
          if (dist <= 14 && (!best || dist < best.d)) best = { norm: f.properties.norm, d: dist };
        }
      }
    }
    if (best) onPick(best.norm);
  }

  return (
    <div id="map" className="mb-16 scroll-mt-24">
      <h2 className="display max-w-[820px] text-[40px] md:text-[52px]">{t.map.title}</h2>
      <p className="mt-4 max-w-[760px] text-[17px] leading-relaxed text-ink/70">{t.map.hint}</p>

      <div
        ref={boxRef}
        className="relative mt-5 h-[440px] touch-none select-none overflow-hidden rounded-[24px] border border-line bg-[#e8e4da] md:h-[560px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="application"
        aria-label={t.map.title}
      >
        <div
          className="absolute inset-0"
          style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
        >
          {tiles.map((tile) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute h-[256px] w-[256px]"
              style={{ left: tile.left, top: tile.top }}
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
            {selectedPath && (
              <>
                <path d={selectedPath} fill="none" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                <path d={selectedPath} fill="none" stroke="#1a1a1a" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
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

        <div
          className="absolute right-3 top-3 flex flex-col gap-2"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => zoom(1)}
            className="h-10 w-10 rounded-full border border-line bg-paper text-[20px] font-semibold leading-none shadow-sm hover:border-ink"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => zoom(-1)}
            className="h-10 w-10 rounded-full border border-line bg-paper text-[20px] font-semibold leading-none shadow-sm hover:border-ink"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        <div
          className="absolute bottom-3 left-3 max-w-[300px] rounded-[14px] border border-line bg-paper/95 px-4 py-3"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-ink/55">{t.map.legendTitle}</p>
          <ul className="mt-2 space-y-1.5">
            {CLASS_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2 text-[13px] leading-snug text-ink/80">
                <span className="mt-[3px] inline-block h-[6px] w-6 shrink-0 rounded-full" style={{ background: CLASS_COLOURS[k] }} />
                <span>
                  {t.classNames[k]}
                  {counts ? <span className="text-ink/55"> · {fmt(counts[k] ?? 0)} {t.streetsWord}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="absolute bottom-3 right-3 rounded-full bg-paper/85 px-3 py-1 text-[11.5px] text-ink/60"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
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
