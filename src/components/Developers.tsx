"use client";

import { useLang } from "@/i18n";
import McpConnect from "./McpConnect";

const endpoints = [
  {
    method: "GET",
    path: "/api/v1/parking/summary",
    desc: "Streets, sections, and the count of streets in each parking class",
    response: `{
  "streets": 13344,
  "segments": 50027,
  "total_length_km": 6461.6,
  "classes": {
    "free":      { "streets": 1442, "segments": 15427, "length_km": 1680.6 },
    "norule":    { "streets": 7423, "segments": 15325, "length_km": 2145.4 },
    "nofree":    { "streets": 3626, "segments": 17526, "length_km": 2358.0 },
    "winter":    { "streets": 853, "segments": 1749, "length_km": 277.5 } }
}`,
  },
  {
    method: "GET",
    path: "/api/v1/parking/streets?class=free&limit=5",
    desc: "Streets in one class, here the free ones, each with its rule counts",
    response: `{ "count": 1442, "streets": [
  { "street": "Glendale Ave", "class": "free",
    "length_km": 0.598, "rules_total": 9,
    "time_limited": 5, "bans": 4 }, … ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/parking/streets?q=yonge",
    desc: "Streets matching a name, with their class and rule counts",
    response: `{ "count": 73, "streets": [
  { "street": "Yonge St", "class": "free",
    "length_km": 17.766, "rules_total": 167,
    "time_limited": 15, "bans": 141 }, … ] }`,
  },
  {
    method: "GET",
    path: "/api/v1/parking/streets/YONGE%20ST",
    desc: "One street in full: its class, its rules by kind, and every section",
    response: `{ "street": "Yonge St", "class": "free",
  "rule_categories": { "no_stopping": 85, … },
  "count": 214,
  "segments": [
    { "segment_id": 436600, "road_class": "Major Arterial",
      "length_m": 97.6, "nearest_green_p_m": 1680 }, … ] }`,
  },
];

export default function Developers() {
  const { t } = useLang();
  return (
    <section id="developers" className="scroll-mt-24 bg-ink text-white">
      <div className="mx-auto max-w-[1392px] px-6 py-20 md:py-28">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/60">{t.developers.kicker}</p>
        <h2 className="display mt-4 max-w-[720px] text-[40px] md:text-[52px]">{t.developers.title}</h2>
        <p className="mt-5 max-w-[720px] text-[18px] leading-relaxed text-white/70">{t.developers.body}</p>

        <h3 className="mt-14 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/60">{t.developers.endpoints}</h3>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {endpoints.map((e) => (
            <article key={e.path} className="overflow-hidden rounded-[24px] bg-white/[0.06]">
              <div className="border-b border-white/10 px-6 py-4">
                <span className="mr-3 rounded-full bg-canada px-2.5 py-1 font-mono text-[12px] font-semibold">{e.method}</span>
                <code className="font-mono text-[13px] text-white/85 break-all">{e.path}</code>
                <p className="mt-2 text-[14px] text-white/60">{e.desc}</p>
              </div>
              <pre className="overflow-x-auto px-6 py-4 font-mono text-[12.5px] leading-relaxed text-white/75">{e.response}</pre>
            </article>
          ))}
        </div>

        <div className="mt-8">
          <a href="/api/openapi.json" className="block rounded-[24px] bg-white/[0.06] p-6 hover:bg-white/[0.09]">
            <h4 className="text-[19px] font-semibold">{t.developers.openapi}</h4>
            <code className="mt-2 block font-mono text-[13px] text-white/60">GET /api/openapi.json</code>
          </a>
        </div>

        <McpConnect
          config={{
            slug: "toronto-free-parking",
            displayName: "Toronto Free Parking",
            exampleEn: "Tell me which class Yonge St is in and why, and how many Toronto streets have no parking rule published",
            exampleFr: "Dis-moi dans quelle classe se trouve Yonge St et pourquoi, et combien de rues de Toronto n'ont aucune règle de stationnement publiée",
          }}
        />
      </div>
    </section>
  );
}
