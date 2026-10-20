"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang, CLASS_KEYS } from "@/i18n";
import type { ClassKey } from "@/i18n";
import FreeMap, { CLASS_COLOURS } from "./FreeMap";
import { findNearbyStreets } from "@/lib/nearme";
import type { NearbyStreet, StreetShape } from "@/lib/nearme";

// streets.json tuple: [street, norm, segments, length_km, class,
// rules_total, tickets, permit_share]
type StreetTuple = [string, string, number, number, ClassKey, number, number, number];

// streets_near.json tuple: [class, no_stopping, no_parking, time_limited,
// nearest_green_p_m | null]
type NearInfo = [ClassKey, number, number, number, number | null];

interface SegRow {
  segment_id: number;
  road_class: string;
  oneway: boolean;
  length_m: number | null;
  addr_lo_l: number | null;
  addr_hi_l: number | null;
  addr_lo_r: number | null;
  addr_hi_r: number | null;
  bike_infra_type: string | null;
  permit_area: string | null;
  green_p_250m: number;
  bike_share_250m: number;
  cafeto_curb_lane_250m: number;
  accessible_stalls_250m: number;
  ev_chargers_250m: number;
  nearest_green_p_m: number | null;
}

interface Detail {
  street: string;
  street_norm: string;
  class: ClassKey;
  rule_categories: Record<string, number>;
  count: number;
  segments: SegRow[];
  rollup: {
    segments: number;
    length_km: number;
    rules_total: number;
    tickets_2023_2025: number;
    permit_share: number;
  } | null;
}

function fmt(n: number) {
  return n.toLocaleString("en-CA");
}

function ClassChip({ cls, small }: { cls: ClassKey; small?: boolean }) {
  const { t } = useLang();
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-cream px-3 ${small ? "py-1 text-[13px]" : "py-1.5 text-[14.5px]"} font-medium`}
    >
      <span className="inline-block h-[7px] w-7 rounded-full" style={{ background: CLASS_COLOURS[cls] }} />
      {t.classNames[cls]}
    </span>
  );
}

export default function StreetFinder() {
  const { t } = useLang();
  const [rows, setRows] = useState<StreetTuple[] | null>(null);
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Near me: the visitor's position and the streets around it are computed
  // entirely in the browser from the same public street shapes the map
  // draws. The position is never sent anywhere.
  const [near, setNear] = useState<NearbyStreet[] | null>(null);
  const [nearState, setNearState] = useState<"idle" | "locating" | "error" | "done">("idle");
  const [nearMsg, setNearMsg] = useState<string | null>(null);
  const [focusPos, setFocusPos] = useState<{ lat: number; lon: number } | null>(null);
  const [nearShapes, setNearShapes] = useState<StreetShape[] | null>(null);
  const [nearInfo, setNearInfo] = useState<Record<string, NearInfo> | null>(null);

  useEffect(() => {
    fetch("/data/streets.json")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const suggestions = useMemo(() => {
    if (!rows || query.trim().length < 2) return [];
    const q = query.trim().toUpperCase();
    return rows
      .filter((r) => r[1].includes(q))
      .sort((a, b) => b[6] - a[6])
      .slice(0, 8);
  }, [rows, query]);

  function runNearMe(lat: number, lon: number) {
    if (nearShapes) {
      setFocusPos({ lat, lon });
      setNear(findNearbyStreets(lat, lon, nearShapes));
      setNearState("done");
    } else {
      fetch("/data/streets_map.geojson")
        .then((r) => r.json())
        .then((fc) => {
          const shapes: StreetShape[] = (fc.features ?? []).map(
            (f: { properties: { street: string; norm: string }; geometry: { coordinates: number[][][] } }) => ({
              norm: f.properties.norm,
              street: f.properties.street,
              lines: f.geometry.coordinates,
            })
          );
          setNearShapes(shapes);
          setFocusPos({ lat, lon });
          setNear(findNearbyStreets(lat, lon, shapes));
          setNearState("done");
        })
        .catch(() => {
          setNearMsg(t.nearme.unavailable);
          setNearState("error");
        });
    }
  }

  function onNearMe() {
    if (!("geolocation" in navigator)) {
      setNearMsg(t.nearme.unavailable);
      setNearState("error");
      return;
    }
    setNearMsg(null);
    setNearState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!nearInfo) {
          fetch("/data/streets_near.json")
            .then((r) => r.json())
            .then((info) => {
              setNearInfo(info);
              runNearMe(latitude, longitude);
            })
            .catch(() => runNearMe(latitude, longitude));
        } else {
          runNearMe(latitude, longitude);
        }
      },
      () => {
        setNearMsg(t.nearme.denied);
        setNearState("error");
      },
      { timeout: 10000 }
    );
  }

  function selectStreet(norm: string) {
    setSelected(norm);
    setShowAll(false);
    setDetail(null);
    setLoadingDetail(true);
    const row = rows?.find((r) => r[1] === norm);
    if (row) setQuery(row[0]);
    setSuggestOpen(false);
    fetch(`/api/v1/parking/streets/${encodeURIComponent(norm)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setDetail(d);
        setLoadingDetail(false);
      })
      .catch(() => setLoadingDetail(false));
  }

  const selRow = rows?.find((r) => r[1] === selected) ?? null;
  const selCls: ClassKey = detail?.class ?? selRow?.[4] ?? "norule";

  return (
    <>
      <FreeMap selectedNorm={selected} onPick={selectStreet} focusPos={focusPos} />

      <div id="explorer" className="scroll-mt-24">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/60">{t.search.kicker}</p>
        <h2 className="display mt-4 text-[40px] md:text-[52px]">{t.search.title}</h2>
        <p className="mt-5 max-w-[760px] text-[18px] leading-relaxed text-ink/70">{t.search.body}</p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            data-testid="nearme-button"
            onClick={onNearMe}
            className="rounded-full bg-canada px-6 py-3 text-[16px] font-semibold text-white hover:bg-canada/90"
          >
            {t.nearme.button}
          </button>
          <p className="text-[15px] text-ink/60">{t.nearme.note}</p>
        </div>
        {nearState === "locating" && (
          <p data-testid="nearme-message" className="mt-4 text-[15px] text-ink/70">{t.nearme.locating}</p>
        )}
        {nearState === "error" && nearMsg && (
          <p data-testid="nearme-message" className="mt-4 max-w-[680px] rounded-[16px] border border-line bg-cream px-5 py-4 text-[15px] leading-relaxed text-ink/80">{nearMsg}</p>
        )}
        {nearState === "done" && near !== null && (
          <div data-testid="nearme-list" className="mt-5 max-w-[760px]">
            <h3 className="text-[19px] font-semibold">{t.nearme.title}</h3>
            {near.length === 0 && <p className="mt-2 text-[15.5px] text-ink/70">{t.nearme.none}</p>}
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-white">
              {near.map((s) => {
                const info = nearInfo?.[s.norm] ?? null;
                const cls: ClassKey = info?.[0] ?? "norule";
                const ns = info?.[1] ?? 0;
                const np = info?.[2] ?? 0;
                const tl = info?.[3] ?? 0;
                const gp = info?.[4] ?? null;
                return (
                  <li key={s.norm}>
                    <button onClick={() => selectStreet(s.norm)} className="block w-full px-5 py-3.5 text-left hover:bg-cream">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[16px] font-semibold">{s.street}</span>
                        <span className="text-[13.5px] text-ink/55">{fmt(Math.round(s.distanceM))} {t.nearme.away}</span>
                      </span>
                      <span className="mt-2 block">
                        <ClassChip cls={cls} small />
                      </span>
                      <span className="mt-2 block text-[14px] leading-relaxed text-ink/70">
                        {t.nearme.noStopping}: {ns} · {t.nearme.noParking}: {np} · {t.nearme.timeLimited}: {tl}
                        {gp !== null && <> · {t.search.nearestGp}: {fmt(gp)} m</>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[13.5px] text-ink/55">{t.nearme.limit}</p>
          </div>
        )}

        <div className="relative mt-8 max-w-[640px]">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
            }}
            placeholder={t.search.placeholder}
            className="w-full rounded-full border border-line bg-white px-6 py-4 text-[17px] outline-none focus:border-ink"
            aria-label={t.search.title}
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-10 mt-2 overflow-hidden rounded-[16px] border border-line bg-white shadow-lg">
              {suggestions.map((r) => (
                <li key={r[1]}>
                  <button
                    onClick={() => selectStreet(r[1])}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-cream"
                  >
                    <span className="flex items-center gap-3 text-[16px] font-medium">
                      <span className="inline-block h-[7px] w-6 shrink-0 rounded-full" style={{ background: CLASS_COLOURS[r[4]] }} />
                      {r[0]}
                    </span>
                    <span className="text-[13.5px] text-ink/55">
                      {r[3]} km · {fmt(r[6])} {t.search.ticketsWord}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {rows && suggestOpen && query.trim().length >= 2 && suggestions.length === 0 && (
            <p className="mt-3 text-[15px] text-ink/60">{t.search.noMatch}</p>
          )}
        </div>

        {loadingDetail && <p className="mt-8 text-ink/60">{t.search.loadingSegs}</p>}

        {detail && (
          <div className="mt-10">
            <h3 className="display text-[34px]">{detail.street}</h3>

            <div className="mt-4 flex max-w-[760px] flex-col gap-2 rounded-[20px] border border-line bg-white px-6 py-5">
              <ClassChip cls={selCls} />
              <p className="text-[16px] leading-relaxed text-ink/75">{t.classBlurbs[selCls]}</p>
            </div>

            <div className="mt-5 grid max-w-[1000px] grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-[20px] border border-line bg-cream p-5">
                <p className="display text-[30px]">{detail.rollup ? `${detail.rollup.length_km} km` : "…"}</p>
                <p className="mt-1 text-[14px] text-ink/60">{t.search.statLength}</p>
              </div>
              <div className="rounded-[20px] border border-line bg-cream p-5">
                <p className="display text-[30px]">{detail.rollup ? fmt(detail.rollup.rules_total) : "…"}</p>
                <p className="mt-1 text-[14px] text-ink/60">{t.search.statRules}</p>
              </div>
              <div className="rounded-[20px] border border-line bg-cream p-5">
                <p className="display text-[30px]">{detail.rollup ? fmt(detail.rollup.tickets_2023_2025) : "…"}</p>
                <p className="mt-1 text-[14px] text-ink/60">{t.search.statTickets}</p>
              </div>
              <div className="rounded-[20px] border border-line bg-cream p-5">
                <p className="display text-[30px]">{fmt(detail.count)}</p>
                <p className="mt-1 text-[14px] text-ink/60">{t.search.segmentsWord}</p>
              </div>
            </div>

            <div className="mt-8 max-w-[760px]">
              <h4 className="text-[17px] font-semibold">{t.search.breakdownTitle}</h4>
              <ul className="mt-3 space-y-2">
                {CLASS_KEYS.map((k) => {
                  const n = k === selCls ? detail.count : 0;
                  return (
                    <li key={k} className="flex items-center gap-3 text-[15px]">
                      <span className="inline-block h-[8px] w-8 shrink-0 rounded-full" style={{ background: CLASS_COLOURS[k] }} />
                      <span className="font-medium">{t.classNames[k]}</span>
                      <span className="text-ink/60">{fmt(n)} {t.sectionsWordShort}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink/60">{t.search.breakdownNote}</p>
            </div>

            <div className="mt-8 max-w-[760px]">
              <h4 className="text-[17px] font-semibold">
                {detail.rollup ? fmt(detail.rollup.rules_total) : 0}{" "}
                {detail.rollup && detail.rollup.rules_total === 1 ? t.search.rulesWordOne : t.search.rulesWord}
              </h4>
              <p className="mt-1 text-[14.5px] text-ink/60">{t.search.rulesNote}</p>
              {Object.keys(detail.rule_categories).length === 0 ? (
                <p className="mt-3 text-[15.5px] text-ink/70">{t.classBlurbs.norule}</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(detail.rule_categories)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, n]) => (
                      <li key={cat} className="rounded-full border border-line bg-cream px-3.5 py-1.5 text-[14px]">
                        {(t.search.ruleCats as Record<string, string>)[cat] ?? cat}: <strong>{fmt(n)}</strong>
                      </li>
                    ))}
                </ul>
              )}
              {detail.rollup && detail.rollup.permit_share > 0 && (
                <p className="mt-4 rounded-[14px] border border-line bg-cream px-4 py-3 text-[14.5px] leading-relaxed text-ink/75">
                  {t.search.permitYes}
                </p>
              )}
            </div>

            <h4 className="mt-10 text-[17px] font-semibold">
              {t.search.segmentsWord} · {fmt(detail.count)}
            </h4>
            <p className="mt-1 text-[14.5px] text-ink/60">
              {detail.count === 1
                ? t.search.sectionsNoteOne
                : t.search.sectionsNote.replace("{n}", fmt(detail.count))}
            </p>
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[16px] border border-line bg-white">
              {(showAll ? detail.segments : detail.segments.slice(0, 40)).map((s) => (
                <li key={s.segment_id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 text-[14.5px]">
                  <span className="font-medium">{s.road_class}</span>
                  <span className="text-ink/60">{s.length_m ? `${Math.round(s.length_m)} m` : ""}</span>
                  <span className="text-ink/60">{s.oneway ? t.search.oneway : t.search.twoway}</span>
                  {(s.addr_lo_l || s.addr_lo_r) && (
                    <span className="text-ink/60">
                      {t.search.addrRange}: {[s.addr_lo_l, s.addr_hi_l].filter(Boolean).join("–")}
                      {s.addr_lo_r ? ` / ${[s.addr_lo_r, s.addr_hi_r].filter(Boolean).join("–")}` : ""}
                    </span>
                  )}
                  {s.bike_infra_type && <span className="text-ink/60">{s.bike_infra_type}</span>}
                  {s.permit_area && <span className="text-ink/60">{t.search.permitWord} {s.permit_area}</span>}
                  {s.nearest_green_p_m !== null && (
                    <span className="text-ink/60">{t.search.nearestGp}: {fmt(s.nearest_green_p_m)} m</span>
                  )}
                  {(s.green_p_250m > 0 || s.bike_share_250m > 0 || s.cafeto_curb_lane_250m > 0 || s.accessible_stalls_250m > 0 || s.ev_chargers_250m > 0) && (
                    <span className="text-ink/60">
                      {t.search.nearWord}:{" "}
                      {[
                        s.green_p_250m > 0 ? `${s.green_p_250m} ${t.search.gpWord}` : null,
                        s.bike_share_250m > 0 ? `${s.bike_share_250m} ${t.search.bsWord}` : null,
                        s.cafeto_curb_lane_250m > 0 ? `${s.cafeto_curb_lane_250m} ${t.search.cafetoWord}` : null,
                        s.accessible_stalls_250m > 0 ? `${s.accessible_stalls_250m} ${t.search.accWord}` : null,
                        s.ev_chargers_250m > 0 ? `${s.ev_chargers_250m} ${t.search.evWord}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!showAll && detail.count > 40 && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-4 rounded-full border border-line px-5 py-2.5 text-[15px] font-medium hover:border-ink"
              >
                {t.search.showAll} ({t.search.showingFirst} 40 {t.search.ofWord} {fmt(detail.count)})
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
