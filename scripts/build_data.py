#!/usr/bin/env python3
"""Build every data file for Toronto Free Parking from the sister project's
combined street parking file. This project classifies; it does not re-join.

Inputs (from ../toronto-open-street-parking, the combined file project):
  data/open_curb_segments.csv     one row per street section (50,027), with
                                  the street's Chapter 950 rule counts by kind
  data/open_curb_streets.csv      one row per street (13,344)
  public/data/streets_map.geojson one simplified shape per street
  data/segments_by_street.json    per-street sections (copied into data/)

Outputs:
  data/app_data.json              summary + street rollup with each street's
                                  class; read server-side by the API routes
  data/segments_by_street.json    copy of the input, for the segments API
  public/data/streets.json        compact street rollup for the page search
  public/data/streets_map.geojson street shapes with the class added
  public/data/streets_near.json   per-street summary for the Near me list:
                                  [class, no_stopping, no_parking,
                                  time_limited, nearest_green_p_m | null]
  data/free_parking_streets.csv   one row per street, with its class
  public/data/free_parking_streets.csv   same file, as a download
  public/data/free_parking_sections.csv  one row per section, with the class
                                  of its street
  data/data_dictionary.md         what each column means (also in public/)

THE CLASSIFICATION (precedence order; the first rule that matches wins).
Rule counts in the combined file belong to a whole street: the bylaw names a
street, not a section, so every section of a street carries the street's
counts, and the class is a property of the street.

  bans  = no parking rules + no stopping rules + no standing rules
  timed = time-limited parking rules

  1. The street has no published rules at all (rules total is 0)
       -> "norule"   No parking rule published
  2. Timed rules exist and are at least as many as the bans
       -> "free"     Free, time limit applies
  3. Bans exist and outnumber the timed rules
       -> "noparking"  No parking
  4. Anything else: the street's only rules are winter or snow rules, or a
     special use (school bus loading, a taxi stand)
       -> "winter"   Only winter rules

Paid parking is NOT a class. The Chapter 950 schedules the city publishes
as open data contain no paid or metered parking category at all (a text
search of all 27,768 current rules finds no pay-and-display, parking
machine, or metered schedule), and the only Green P source lists off-street
car parks, not on-street spaces. Paid status therefore cannot be read off
the open data street by street, and this project does not guess it.
"""
import csv
import json
import os
import shutil

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIB = os.path.join(os.path.dirname(BASE), "toronto-open-street-parking")

RULE_CATS = [
    "no_parking", "no_stopping", "no_standing", "time_limited_parking",
    "commercial_loading", "passenger_loading", "delivery_vehicle_parking",
    "bus_loading", "school_bus_loading", "bus_parking", "taxicab_stand",
    "winter_parking_prohibited", "snow_storm_parking", "carshare_parking",
    "ev_charging_parking", "municipal_parking_facility",
    "permitted_angle_parking", "reserved_lane",
]

CLASS_ORDER = ["free", "norule", "noparking", "winter"]


def classify(total, bans, timed):
    if total == 0:
        return "norule"
    if timed > 0 and timed >= bans:
        return "free"
    if bans > 0:
        return "noparking"
    return "winter"


def num(v):
    if v is None or v == "":
        return None
    f = float(v)
    return int(f) if f == int(f) else f


def main():
    # ---- street profiles from the section file --------------------------
    seg_path = os.path.join(SIB, "data", "open_curb_segments.csv")
    profiles = {}
    sections = []
    with open(seg_path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            norm = r["street_norm"]
            p = profiles.get(norm)
            if p is None:
                cats = {c: int(r[f"rules_{c}"] or 0) for c in RULE_CATS}
                bans = cats["no_parking"] + cats["no_stopping"] + cats["no_standing"]
                p = profiles[norm] = {
                    "street": r["street_name"],
                    "street_norm": norm,
                    "rule_categories": {k: v for k, v in cats.items() if v > 0},
                    "rules_total": int(r["rules_total"] or 0),
                    "bans": bans,
                    "time_limited": cats["time_limited_parking"],
                    "winter_rules": cats["winter_parking_prohibited"] + cats["snow_storm_parking"],
                    "segments": 0,
                    "length_m": 0.0,
                }
                p["class"] = classify(p["rules_total"], bans, p["time_limited"])
            p["segments"] += 1
            p["length_m"] += float(r["length_m"] or 0)
            sections.append((norm, r))

    # ---- rollup numbers (tickets, shares) --------------------------------
    roll = {}
    with open(os.path.join(SIB, "data", "open_curb_streets.csv"), newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            roll[r["street_norm"]] = {
                "tickets_2023_2025": int(r["tickets_2023_2025"]),
                "bike_infra_share": float(r["bike_infra_share"]),
                "permit_share": float(r["permit_share"]),
                "green_p_250m_max": int(r["green_p_250m_max"]),
            }
    for norm, p in profiles.items():
        extra = roll.get(norm, {})
        p["tickets_2023_2025"] = extra.get("tickets_2023_2025", 0)
        p["bike_infra_share"] = extra.get("bike_infra_share", 0.0)
        p["permit_share"] = extra.get("permit_share", 0.0)
        p["green_p_250m_max"] = extra.get("green_p_250m_max", 0)
        p["length_km"] = round(p["length_m"] / 1000.0, 3)
        del p["length_m"]

    streets = sorted(profiles.values(), key=lambda p: -p["tickets_2023_2025"])

    # ---- class totals ------------------------------------------------------
    totals = {c: {"streets": 0, "segments": 0, "length_km": 0.0} for c in CLASS_ORDER}
    for p in streets:
        t = totals[p["class"]]
        t["streets"] += 1
        t["segments"] += p["segments"]
        t["length_km"] += p["length_km"]
    for t in totals.values():
        t["length_km"] = round(t["length_km"], 1)

    summary = {
        "built": "2026-10-20",
        "streets": len(streets),
        "segments": sum(p["segments"] for p in streets),
        "total_length_km": round(sum(p["length_km"] for p in streets), 1),
        "rules_on_streets": sum(p["rules_total"] for p in streets),
        "tickets_2023_2025": sum(p["tickets_2023_2025"] for p in streets),
        "classes": totals,
    }

    app = {"summary": summary, "streets": streets}
    with open(os.path.join(BASE, "data", "app_data.json"), "w", encoding="utf-8") as f:
        json.dump(app, f, ensure_ascii=False, separators=(",", ":"))
    print("app_data.json:", summary)

    # ---- segments_by_street.json (server-side, copied) -------------------
    shutil.copyfile(
        os.path.join(SIB, "data", "segments_by_street.json"),
        os.path.join(BASE, "data", "segments_by_street.json"),
    )

    # ---- public rollup for the page search -------------------------------
    # tuple: [street, norm, segments, length_km, class, rules_total, tickets,
    #         permit_share]
    rows = [
        [p["street"], p["street_norm"], p["segments"], p["length_km"],
         p["class"], p["rules_total"], p["tickets_2023_2025"], p["permit_share"]]
        for p in streets
    ]
    with open(os.path.join(BASE, "public", "data", "streets.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    print("streets.json:", len(rows), "streets")

    # ---- map geometry with the class added --------------------------------
    with open(os.path.join(SIB, "public", "data", "streets_map.geojson"), encoding="utf-8") as f:
        fc = json.load(f)
    cls_by_norm = {p["street_norm"]: p["class"] for p in streets}
    missing = 0
    for feat in fc["features"]:
        props = feat["properties"]
        cls = cls_by_norm.get(props["norm"])
        if cls is None:
            missing += 1
            cls = "norule"
        feat["properties"] = {"street": props["street"], "norm": props["norm"], "cls": cls}
    with open(os.path.join(BASE, "public", "data", "streets_map.geojson"), "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
    print("streets_map.geojson:", len(fc["features"]), "features, missing class:", missing)

    # ---- Near me summary ----------------------------------------------------
    with open(os.path.join(BASE, "data", "segments_by_street.json"), encoding="utf-8") as f:
        by_street = json.load(f)
    near = {}
    for norm, entry in by_street.items():
        cats = entry.get("rule_categories") or {}
        nearest = None
        for seg in entry.get("segments") or []:
            v = seg[-1]
            if v is not None and (nearest is None or v < nearest):
                nearest = v
        p = profiles.get(norm)
        near[norm] = [
            p["class"] if p else "norule",
            int(cats.get("no_stopping", 0)),
            int(cats.get("no_parking", 0)),
            int(cats.get("time_limited_parking", 0)),
            nearest,
        ]
    with open(os.path.join(BASE, "public", "data", "streets_near.json"), "w", encoding="utf-8") as f:
        json.dump(near, f, ensure_ascii=False, separators=(",", ":"))
    print("streets_near.json:", len(near), "streets")

    # ---- classified downloads ----------------------------------------------
    street_fields = [
        "street", "street_norm", "class", "segments", "length_km",
        "rules_total", "no_parking_rules", "no_stopping_rules",
        "no_standing_rules", "time_limited_rules", "winter_rules",
        "tickets_2023_2025", "permit_share", "bike_infra_share",
    ]
    street_rows = [
        {
            "street": p["street"], "street_norm": p["street_norm"],
            "class": p["class"], "segments": p["segments"],
            "length_km": p["length_km"], "rules_total": p["rules_total"],
            "no_parking_rules": p["rule_categories"].get("no_parking", 0),
            "no_stopping_rules": p["rule_categories"].get("no_stopping", 0),
            "no_standing_rules": p["rule_categories"].get("no_standing", 0),
            "time_limited_rules": p["rule_categories"].get("time_limited_parking", 0),
            "winter_rules": p["winter_rules"],
            "tickets_2023_2025": p["tickets_2023_2025"],
            "permit_share": p["permit_share"],
            "bike_infra_share": p["bike_infra_share"],
        }
        for p in streets
    ]
    for dest in [os.path.join(BASE, "data", "free_parking_streets.csv"),
                 os.path.join(BASE, "public", "data", "free_parking_streets.csv")]:
        with open(dest, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=street_fields)
            w.writeheader()
            w.writerows(street_rows)
    print("free_parking_streets.csv:", len(street_rows), "rows")

    sec_fields = [
        "segment_id", "street", "street_norm", "class", "road_class",
        "oneway", "length_m", "addr_lo_l", "addr_hi_l", "addr_lo_r",
        "addr_hi_r", "bike_infra_type", "permit_area", "nearest_green_p_m",
    ]
    with open(os.path.join(BASE, "public", "data", "free_parking_sections.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=sec_fields)
        w.writeheader()
        for norm, r in sections:
            w.writerow({
                "segment_id": r["segment_id"], "street": r["street_name"],
                "street_norm": norm, "class": profiles[norm]["class"],
                "road_class": r["road_class"], "oneway": r["oneway"],
                "length_m": r["length_m"], "addr_lo_l": r["addr_lo_l"],
                "addr_hi_l": r["addr_hi_l"], "addr_lo_r": r["addr_lo_r"],
                "addr_hi_r": r["addr_hi_r"],
                "bike_infra_type": r["bike_infra_type"],
                "permit_area": r["permit_area"],
                "nearest_green_p_m": r["nearest_green_p_m"],
            })
    print("free_parking_sections.csv:", len(sections), "rows")


if __name__ == "__main__":
    main()
