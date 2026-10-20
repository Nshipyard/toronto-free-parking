#!/usr/bin/env python3
"""Capture screenshots from the local server, and verify the Near me paths.

Playwright's bundled Chromium can reach 127.0.0.1 loopback in this
environment, so the app hydrates with real data. The external Esri basemap
tiles cannot load from the sandbox, so the map shows the coloured streets
on a blank background (the known caveat).

Usage: PORT=3108 python3 scripts/screenshot.py
"""
import os, sys

BASE = os.path.expanduser("~/workspace/nshipyard-builds/toronto-free-parking")
PORT = os.environ.get("PORT", "3108")

def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed"); sys.exit(1)
    url = f"http://127.0.0.1:{PORT}/"
    outdir = os.path.join(BASE, "docs/screenshots")
    os.makedirs(outdir, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu"])

        # Desktop, full page (homepage with the map).
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        pg.goto(url, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2500)
        out = os.path.join(outdir, "desktop.png")
        pg.screenshot(path=out, full_page=True)
        print("wrote", out, os.path.getsize(out), "bytes")

        # Street open: search Yonge and pick the suggestion.
        pg.fill("input[aria-label]", "Yonge")
        pg.wait_for_timeout(1200)
        pg.click("text=Yonge St")
        pg.wait_for_timeout(2500)
        pg.evaluate("window.scrollBy(0, 620)")
        out = os.path.join(outdir, "street-yonge.png")
        pg.screenshot(path=out, full_page=False)
        print("wrote", out, os.path.getsize(out), "bytes")

        # Street open: High Park Ave must carry the free class (it has
        # time-limited parking rules, so part of it is free to park on).
        pg.evaluate("window.scrollTo(0, 0)")
        pg.fill("input[aria-label]", "High Park Ave")
        pg.wait_for_timeout(1200)
        pg.click("text=High Park Ave")
        pg.wait_for_selector("text=Free parking on part of this street", timeout=20000)
        pg.wait_for_timeout(1500)
        pg.evaluate("window.scrollBy(0, 620)")
        out = os.path.join(outdir, "street-high-park.png")
        pg.screenshot(path=out, full_page=False)
        print("wrote", out, os.path.getsize(out), "bytes")
        print("high park ave profile shows the free class")
        pg.close()

        # Mobile top.
        pg = browser.new_page(viewport={"width": 390, "height": 844})
        pg.goto(url, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2500)
        out = os.path.join(outdir, "mobile.png")
        pg.screenshot(path=out, full_page=False)
        print("wrote", out, os.path.getsize(out), "bytes")
        pg.close()

        # Near me, denied: no geolocation permission granted.
        ctx = browser.new_context(viewport={"width": 900, "height": 900})
        pg = ctx.new_page()
        pg.goto(url, wait_until="networkidle", timeout=60000)
        pg.wait_for_selector("text=1,442 streets", timeout=30000)  # app hydrated
        for _ in range(3):
            pg.click("[data-testid=nearme-button]")
            try:
                pg.wait_for_selector("[data-testid=nearme-message]", timeout=8000)
                break
            except Exception:
                continue
        pg.wait_for_selector("[data-testid=nearme-message]", timeout=15000)
        msg = pg.inner_text("[data-testid=nearme-message]")
        print("nearme denial message:", msg[:110])
        out = os.path.join(outdir, "nearme-denied.png")
        pg.screenshot(path=out, full_page=False)
        print("wrote", out, os.path.getsize(out), "bytes")
        ctx.close()

        # Near me, granted at Yonge and Bloor (43.6708, -79.3832).
        ctx = browser.new_context(
            viewport={"width": 900, "height": 1000},
            geolocation={"latitude": 43.6708, "longitude": -79.3832},
            permissions=["geolocation"],
        )
        pg = ctx.new_page()
        pg.goto(url, wait_until="networkidle", timeout=60000)
        pg.wait_for_selector("text=1,442 streets", timeout=30000)  # app hydrated
        pg.click("[data-testid=nearme-button]")
        pg.wait_for_selector("[data-testid=nearme-list]", timeout=30000)
        pg.wait_for_timeout(1000)
        items = pg.query_selector_all("[data-testid=nearme-list] li")
        print("nearme streets within 500 m of Yonge and Bloor:", len(items))
        first = items[0].inner_text().replace("\n", " | ") if items else ""
        print("nearest:", first[:160])
        out = os.path.join(outdir, "nearme.png")
        pg.screenshot(path=out, full_page=False)
        print("wrote", out, os.path.getsize(out), "bytes")
        ctx.close()

        # Near me, granted near High Park (43.65, -79.465): High Park Ave
        # must appear in the list labelled with the free class.
        ctx = browser.new_context(
            viewport={"width": 900, "height": 1000},
            geolocation={"latitude": 43.65, "longitude": -79.465},
            permissions=["geolocation"],
        )
        pg = ctx.new_page()
        pg.goto(url, wait_until="networkidle", timeout=60000)
        pg.wait_for_selector("text=1,442 streets", timeout=30000)  # app hydrated
        pg.click("[data-testid=nearme-button]")
        pg.wait_for_selector("[data-testid=nearme-list]", timeout=30000)
        pg.wait_for_timeout(1000)
        items = pg.query_selector_all("[data-testid=nearme-list] li")
        print("nearme streets within 500 m of High Park test point:", len(items))
        hp = None
        for it in items:
            txt = it.inner_text()
            if txt.startswith("High Park Ave"):
                hp = txt.replace("\n", " | ")
                break
        print("high park ave nearme entry:", hp[:200] if hp else "NOT FOUND")
        assert hp and "Free parking on part of this street" in hp, "High Park Ave is not labelled free in Near me"
        out = os.path.join(outdir, "nearme-high-park.png")
        pg.screenshot(path=out, full_page=False)
        print("wrote", out, os.path.getsize(out), "bytes")
        ctx.close()

        browser.close()

if __name__ == "__main__":
    main()
