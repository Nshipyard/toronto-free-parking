import { NextResponse } from "next/server";
import { getData, getSegmentsByStreet, expandSegment } from "@/lib/parking";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ street: string }> }
) {
  const { street } = await params;
  const norm = decodeURIComponent(street).toUpperCase();
  const byStreet = getSegmentsByStreet();
  const key =
    byStreet[norm] !== undefined
      ? norm
      : Object.keys(byStreet).find(
          (k) => byStreet[k].street.toUpperCase() === norm
        );
  if (!key) {
    return NextResponse.json({ error: "Street not found" }, { status: 404 });
  }
  const entry = byStreet[key];
  const rollup = getData().streets.find((s) => s.street_norm === key) ?? null;
  return NextResponse.json({
    street: entry.street,
    street_norm: key,
    class: rollup?.class ?? null,
    rule_categories: entry.rule_categories,
    rollup: rollup
      ? {
          segments: rollup.segments,
          length_km: rollup.length_km,
          rules_total: rollup.rules_total,
          bans: rollup.bans,
          time_limited: rollup.time_limited,
          winter_rules: rollup.winter_rules,
          tickets_2023_2025: rollup.tickets_2023_2025,
          bike_infra_share: rollup.bike_infra_share,
          permit_share: rollup.permit_share,
          green_p_250m_max: rollup.green_p_250m_max,
        }
      : null,
    count: entry.segments.length,
    segments: entry.segments.map(expandSegment),
  });
}
