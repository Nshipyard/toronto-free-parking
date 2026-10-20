import { NextResponse } from "next/server";
import { getData, CLASS_ORDER } from "@/lib/parking";
import type { ParkingClass } from "@/lib/parking";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toUpperCase();
  const cls = url.searchParams.get("class") ?? "";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  let rows = getData().streets;
  if (cls) {
    if (!CLASS_ORDER.includes(cls as ParkingClass)) {
      return NextResponse.json(
        { error: `class must be one of: ${CLASS_ORDER.join(", ")}` },
        { status: 400 }
      );
    }
    rows = rows.filter((s) => s.class === cls);
  }
  if (q) rows = rows.filter((s) => s.street_norm.includes(q) || s.street.toUpperCase().includes(q));
  return NextResponse.json({ count: rows.length, streets: rows.slice(0, limit) });
}
