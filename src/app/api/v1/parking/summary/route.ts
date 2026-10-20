import { NextResponse } from "next/server";
import { getData } from "@/lib/parking";

export async function GET() {
  const s = getData().summary;
  return NextResponse.json({
    ...s,
    class_names: {
      free: "Free parking on part of this street",
      norule: "No parking rule published",
      nofree: "No free parking in the published rules",
      winter: "Only winter rules",
    },
    paid_parking: {
      in_data: false,
      note: "Paid or metered parking cannot be read off the city's published parking rules. The Chapter 950 schedules contain no paid or metered category, and no open file lists which streets carry parking machines. No street is given a paid class.",
    },
  });
}
