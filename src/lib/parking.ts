import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");

export type ParkingClass = "free" | "norule" | "noparking" | "winter";

export const CLASS_ORDER: ParkingClass[] = ["free", "norule", "noparking", "winter"];

export interface ClassTotals {
  streets: number;
  segments: number;
  length_km: number;
}

export interface StreetRow {
  street: string;
  street_norm: string;
  class: ParkingClass;
  segments: number;
  length_km: number;
  rules_total: number;
  bans: number;
  time_limited: number;
  winter_rules: number;
  rule_categories: Record<string, number>;
  tickets_2023_2025: number;
  bike_infra_share: number;
  permit_share: number;
  green_p_250m_max: number;
}

export interface Summary {
  built: string;
  streets: number;
  segments: number;
  total_length_km: number;
  rules_on_streets: number;
  tickets_2023_2025: number;
  classes: Record<ParkingClass, ClassTotals>;
}

export interface AppData {
  summary: Summary;
  streets: StreetRow[];
}

let cache: AppData | null = null;

export function getData(): AppData {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(path.join(DATA, "app_data.json"), "utf-8")) as AppData;
  }
  return cache;
}

export function getStreet(norm: string): StreetRow | undefined {
  return getData().streets.find((s) => s.street_norm === norm);
}

// Per-street segment data, copied from the sister project Toronto Open
// Street Parking (its data/segments_by_street.json, built from the same
// combined file). Rule counts in the source are street-level, so rules are
// stored once per street as rule_categories.
export type SegmentTuple = [
  number, // segment_id
  string, // road_class
  number, // oneway 1/0
  number, // length_m
  number | null, // addr_lo_l
  number | null, // addr_hi_l
  number | null, // addr_lo_r
  number | null, // addr_hi_r
  string, // bike_infra_type ("" when none)
  string, // permit_area ("" when none)
  number, // green_p_250m
  number, // bike_share_250m
  number, // cafeto_curb_lane_250m
  number, // accessible_stalls_250m
  number, // ev_chargers_250m
  number | null, // nearest_green_p_m
];

export interface StreetSegments {
  street: string;
  rule_categories: Record<string, number>;
  segments: SegmentTuple[];
}

let segCache: Record<string, StreetSegments> | null = null;

export function getSegmentsByStreet(): Record<string, StreetSegments> {
  if (!segCache) {
    segCache = JSON.parse(
      fs.readFileSync(path.join(DATA, "segments_by_street.json"), "utf-8")
    ) as Record<string, StreetSegments>;
  }
  return segCache;
}

export function expandSegment(t: SegmentTuple) {
  return {
    segment_id: t[0],
    road_class: t[1],
    oneway: t[2] === 1,
    length_m: t[3],
    addr_lo_l: t[4],
    addr_hi_l: t[5],
    addr_lo_r: t[6],
    addr_hi_r: t[7],
    bike_infra_type: t[8] || null,
    permit_area: t[9] || null,
    green_p_250m: t[10],
    bike_share_250m: t[11],
    cafeto_curb_lane_250m: t[12],
    accessible_stalls_250m: t[13],
    ev_chargers_250m: t[14],
    nearest_green_p_m: t[15],
  };
}

export function fmt(n: number): string {
  return n.toLocaleString("en-CA");
}
