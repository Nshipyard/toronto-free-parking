#!/usr/bin/env python3
"""Verify the layout rework: selecting a street zooms the map to it, the
profile sits with the map, and phones / tablets / desktop all fit.

For each viewport: load the homepage (no horizontal overflow), pick
High Park Ave and Yonge St from the search box, and check that the
selected street's shape fills the map view and that the street's panel
heading is on the same screen. On the phone viewport it also smoke-tests
a one-finger drag (mouse) and a two-finger pinch (CDP touch events).

The sandbox cannot load Esri basemap tiles, so the streets draw on a
blank background; framing is judged from the street shapes themselves.

Usage: PORT=3111 python3 scripts/screenshot_layout.py
"""
import os, sys

BASE = os.path.expanduser("~/workspace/nshipyard-builds/toronto-free-parking")
PORT = os.environ.get("PORT", "3111")

VIEWPORTS = [
    ("iphone-se", 375, 667, True),
    ("iphone", 390, 844, True),
    ("iphone-max", 430, 932, True),
    ("ipad", 768, 1024, True),
    ("ipad-air", 820, 1180, True),
    ("desktop", 1440, 900, False),
]
_only = os.environ.get("ONLY")
if _only:
    _keep = {s.strip() for s in _only.split(",")}
    VIEWPORTS = [v for v in VIEWPORTS if v[0] in _keep]


def select_street(pg, name):
    pg.fill("input[aria-label]", name)
    pg.wait_for_timeout(900)
    pg.click(f"text={name}")
    pg.wait_for_selector("[data-testid=selected-path]", timeout=30000)
    # Wait for the app-driven scroll to settle (map position stable).
    last = None
    stable = 0
    for _ in range(30):
        pg.wait_for_timeout(200)
        top = pg.evaluate(
            """() => {
              const m = document.querySelector('[data-testid="street-map"]');
              return m ? m.getBoundingClientRect().top : null;
            }"""
        )
        if top is not None and last is not None and abs(top - last) < 2:
            stable += 1
            if stable >= 2:
                break
        else:
            stable = 0
        last = top
    # The street's profile heading must actually be rendered before its
    # on-screen position means anything.
    pg.wait_for_selector(f"h3:text-is('{name}')", timeout=15000)
    pg.wait_for_timeout(400)


def framing(pg):
    """Selected street's on-screen size relative to the map box."""
    return pg.evaluate(
        """() => {
          const map = document.querySelector('[role="application"]');
          const sel = document.querySelector('[data-testid="selected-path"]');
          if (!map || !sel) return null;
          const m = map.getBoundingClientRect();
          const r = sel.getBoundingClientRect();
          return {
            mapW: m.width, mapH: m.height,
            w: r.width, h: r.height,
            inside: r.left >= m.left - 2 && r.right <= m.right + 2 &&
                    r.top >= m.top - 2 && r.bottom <= m.bottom + 2,
            cover: Math.max(r.width / m.width, r.height / m.height),
          };
        }"""
    )


def panel_heading_visible(pg, street):
    box = pg.evaluate(
        """(street) => {
          const hs = [...document.querySelectorAll('h3')];
          const el = hs.find((h) => h.textContent.trim() === street);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
        }""",
        street,
    )
    return box


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed")
        sys.exit(1)
    url = f"http://127.0.0.1:{PORT}/"
    outdir = os.path.join(BASE, "docs/screenshots")
    os.makedirs(outdir, exist_ok=True)
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu"])
        for name, w, h, touch in VIEWPORTS:
            ctx = browser.new_context(
                viewport={"width": w, "height": h},
                is_mobile=touch,
                has_touch=touch,
            )
            pg = ctx.new_page()
            pg.goto(url, wait_until="networkidle", timeout=60000)
            pg.wait_for_selector("text=1,442", timeout=30000)
            pg.wait_for_selector("#map svg path", timeout=30000)
            pg.wait_for_timeout(1200)

            overflow = pg.evaluate(
                "document.documentElement.scrollWidth - window.innerWidth"
            )
            print(f"[{name}] horizontal overflow px: {overflow}")
            if overflow > 1:
                failures.append(f"{name}: horizontal overflow {overflow}px")

            out = os.path.join(outdir, f"layout-{name}-home.png")
            pg.screenshot(path=out)
            print("wrote", out, os.path.getsize(out), "bytes")

            # High Park Ave: free class, ~1.4 km street.
            select_street(pg, "High Park Ave")
            fr = framing(pg)
            print(f"[{name}] High Park Ave framing: {fr}")
            if not fr or not fr["inside"] or fr["cover"] < 0.5:
                failures.append(f"{name}: High Park Ave framing bad: {fr}")
            # No manual scrolling here: the app itself scrolls the map
            # into view on selection, so this measures what a visitor
            # actually sees.
            vis = panel_heading_visible(pg, "High Park Ave")
            print(f"[{name}] panel heading: {vis}")
            if not vis or vis["top"] < -4 or vis["bottom"] > vis["vh"] + 4:
                # On tall desktop the panel is beside the map; heading must
                # at least share the screen once the map is scrolled to.
                failures.append(f"{name}: High Park Ave panel heading off-screen: {vis}")
            cls = pg.evaluate(
                """() => {
                  const chips = [...document.querySelectorAll('h3')];
                  return document.body.innerText.includes('Free parking on part of this street');
                }"""
            )
            print(f"[{name}] free class text present: {cls}")
            out = os.path.join(outdir, f"layout-{name}-highpark.png")
            pg.screenshot(path=out)
            print("wrote", out, os.path.getsize(out), "bytes")

            # Yonge St: the long north-south street.
            select_street(pg, "Yonge St")
            fr = framing(pg)
            print(f"[{name}] Yonge St framing: {fr}")
            if not fr or not fr["inside"] or fr["cover"] < 0.5:
                failures.append(f"{name}: Yonge St framing bad: {fr}")
            out = os.path.join(outdir, f"layout-{name}-yonge.png")
            pg.screenshot(path=out)
            print("wrote", out, os.path.getsize(out), "bytes")

            if name == "iphone":
                # Drag smoke test: one-finger (mouse) drag moves the map.
                before = pg.evaluate(
                    """() => {
                      const p = document.querySelector('#map svg path');
                      const r = p.getBoundingClientRect();
                      return { x: r.x, y: r.y };
                    }"""
                )
                box = pg.evaluate(
                    """() => {
                      const m = document.querySelector('[role="application"]');
                      const r = m.getBoundingClientRect();
                      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
                    }"""
                )
                pg.mouse.move(box["cx"], box["cy"])
                pg.mouse.down()
                pg.mouse.move(box["cx"] + 90, box["cy"] + 50, steps=8)
                pg.mouse.up()
                pg.wait_for_timeout(600)
                after = pg.evaluate(
                    """() => {
                      const p = document.querySelector('#map svg path');
                      const r = p.getBoundingClientRect();
                      return { x: r.x, y: r.y };
                    }"""
                )
                moved = abs(after["x"] - before["x"]) + abs(after["y"] - before["y"])
                print(f"[iphone] drag moved map content by {moved:.1f}px")
                if moved < 30:
                    failures.append(f"iphone: drag did not pan the map ({moved})")

                # Pinch smoke test: two touch points moving apart zoom in.
                cdp = ctx.new_cdp_session(pg)
                sel_before = framing(pg)
                cxp, cyp = box["cx"], box["cy"]

                def touch(ttype, points):
                    cdp.send(
                        "Input.dispatchTouchEvent",
                        {
                            "type": ttype,
                            "touchPoints": [
                                {"x": x, "y": y, "id": i + 1}
                                for i, (x, y) in enumerate(points)
                            ],
                        },
                    )

                touch("touchStart", [(cxp - 40, cyp), (cxp + 40, cyp)])
                for step in range(1, 6):
                    d = 40 + step * 22
                    touch("touchMove", [(cxp - d, cyp), (cxp + d, cyp)])
                    pg.wait_for_timeout(60)
                touch("touchEnd", [])
                pg.wait_for_timeout(800)
                sel_after = framing(pg)
                print(f"[iphone] pinch: cover before {sel_before} after {sel_after}")
                if sel_before and sel_after and sel_after["cover"] <= sel_before["cover"]:
                    failures.append("iphone: pinch did not zoom in")
            ctx.close()
        browser.close()
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\nAll layout checks passed.")


if __name__ == "__main__":
    main()
