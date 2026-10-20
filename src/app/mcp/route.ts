import { NextResponse } from "next/server";
import { getData, getStreet } from "@/lib/parking";

// Minimal MCP server (streamable HTTP, JSON-RPC) exposing the Toronto Free
// Parking data as tools. Same canonical data as the REST API.

const TOOLS = [
  {
    name: "parking_summary",
    description:
      "Headline counts for Toronto Free Parking: streets, sections, total length, and the count of streets, sections, and kilometres in each parking class (free, norule, noparking, winter), plus why paid parking is not classified.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "parking_search_streets",
    description:
      "Search Toronto streets by name and/or parking class. Returns each street's class, length, rule counts (total, bans, time-limited, winter), and tickets 2023-2025.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Substring of the street name, e.g. 'yonge'" },
        class: {
          type: "string",
          enum: ["free", "norule", "noparking", "winter"],
          description: "Only streets in this class",
        },
        limit: { type: "number", description: "Max streets to return (default 20, max 200)" },
      },
    },
  },
  {
    name: "parking_street_profile",
    description:
      "The full profile of one Toronto street: its parking class, length, sections, rule counts by kind, and tickets 2023-2025. Example street: 'YONGE ST'.",
    inputSchema: {
      type: "object",
      properties: { street: { type: "string", description: "Street name, e.g. 'Yonge St'" } },
      required: ["street"],
    },
  },
];

function callTool(name: string, args: Record<string, unknown>) {
  const data = getData();
  if (name === "parking_summary") {
    return {
      ...data.summary,
      paid_parking:
        "Not classified. The Chapter 950 schedules the city publishes contain no paid or metered category, and no open file lists which streets carry parking machines.",
    };
  }
  if (name === "parking_search_streets") {
    const q = String(args.q ?? "").toUpperCase();
    const cls = String(args.class ?? "");
    const limit = Math.min(200, Math.max(1, Number(args.limit ?? 20)));
    let rows = data.streets;
    if (cls) rows = rows.filter((s) => s.class === cls);
    if (q) rows = rows.filter((s) => s.street_norm.includes(q) || s.street.toUpperCase().includes(q));
    return { count: rows.length, streets: rows.slice(0, limit) };
  }
  if (name === "parking_street_profile") {
    const wanted = String(args.street ?? "").toUpperCase();
    const row =
      getStreet(wanted) ??
      data.streets.find((s) => s.street.toUpperCase() === wanted) ??
      data.streets.find((s) => s.street_norm.includes(wanted));
    if (!row) return { error: "Street not found" };
    return row;
  }
  return { error: `Unknown tool: ${name}` };
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(req: Request) {
  let body: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const { id, method, params } = body;
  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "toronto-free-parking", version: "1.0.0" },
      });
    case "notifications/initialized":
      return new NextResponse(null, { status: 202 });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name ?? "";
      const args = params?.arguments ?? {};
      const out = callTool(name, args);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
      });
    }
    default:
      return rpcError(id ?? null, -32601, `Method not found: ${method}`);
  }
}
