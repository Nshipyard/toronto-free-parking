import { NextResponse } from "next/server";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Toronto Free Parking API",
    version: "1.0.0",
    description:
      "Every Toronto street classified by what the parking rules the city itself publishes say about it: free parking on part of the street, no parking rule published, no free parking in the published rules, or only winter rules. Built from City of Toronto open data (parking bylaw, Chapter 950, and parking tickets 2023-2025) combined by the sister project Toronto Open Street Parking. Paid parking is deliberately not classified: the published bylaw schedules contain no paid or metered category.",
    license: { name: "MIT" },
  },
  servers: [{ url: "https://free-parking.canada.nshipyard.com/api/v1" }],
  paths: {
    "/parking/summary": {
      get: {
        summary: "Headline counts: streets, sections, and streets per parking class",
        operationId: "parkingSummary",
        responses: { "200": { description: "Summary object" } },
      },
    },
    "/parking/streets": {
      get: {
        summary: "Streets with their class and rule counts, searchable by name and class",
        operationId: "parkingStreets",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Substring match on the street name" },
          { name: "class", in: "query", schema: { type: "string", enum: ["free", "norule", "nofree", "winter"] }, description: "Only streets in this class" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: { "200": { description: "Matching streets (count is the full match count)" } },
      },
    },
    "/parking/streets/{street}": {
      get: {
        summary: "One street in full: its class, its rules by kind, and every street section",
        operationId: "parkingStreet",
        parameters: [
          { name: "street", in: "path", required: true, schema: { type: "string" }, description: "Street name, e.g. YONGE ST" },
        ],
        responses: {
          "200": { description: "The street, with class, rule categories, and sections" },
          "404": { description: "Street not found" },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec);
}
