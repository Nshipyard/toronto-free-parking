"use client";

import { useState } from "react";
import { useLang } from "@/i18n";
import MapleLeaf from "./MapleLeaf";

export function Banner() {
  const { t } = useLang();
  return (
    <div className="bg-ink text-white">
      <div className="mx-auto flex max-w-[1392px] items-center justify-center gap-3 px-6 py-2.5 text-[13px] leading-snug">
        <span className="rounded-full border border-white/30 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide">
          {t.banner.badge}
        </span>
        <p className="text-white/85">{t.banner.line}</p>
      </div>
    </div>
  );
}

export function Nav() {
  const { t, lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/#map", label: t.nav.map },
    { href: "/#explorer", label: t.nav.search },
    { href: "/#howto", label: t.nav.howto },
    { href: "/#developers", label: t.nav.developers },
    { href: "/#data", label: t.nav.data },
  ];
  return (
    <header className="border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1392px] items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-2.5">
          <MapleLeaf className="h-7 w-7 text-canada" />
          <span className="flex flex-col gap-[2px] leading-none"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">Open Nshipyard</span><span className="display text-[24px]">Free Parking</span></span>
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[15px] font-medium text-ink/70 hover:text-ink">
              {l.label}
            </a>
          ))}
          <a
            href="https://canada.nshipyard.com"
            className="text-[15px] font-medium text-ink/70 hover:text-ink"
          >
            ← {t.nav.back}
          </a>
          <div className="flex items-center rounded-full border border-line text-[14px] font-medium">
            {(["en", "fr"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1.5 uppercase ${lang === l ? "bg-ink text-white" : "text-ink/60 hover:text-ink"}`}
                aria-pressed={lang === l}
              >
                {l}
              </button>
            ))}
          </div>
        </nav>
        <button
          className="rounded-full border border-line px-4 py-2 text-[15px] font-medium md:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          Menu
        </button>
      </div>
      {open && (
        <div className="border-t border-line px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-[16px] font-medium">
                {l.label}
              </a>
            ))}
            <a href="https://canada.nshipyard.com" className="text-[16px] font-medium">
              ← {t.nav.back}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="bg-paper">
      <div className="mx-auto max-w-[1392px] border-t border-line px-6 py-12">
        <div className="flex items-center gap-2.5">
          <MapleLeaf className="h-6 w-6 text-canada" />
          <span className="display text-[22px]">Open Nshipyard</span>
        </div>
        <p className="mt-6 max-w-[640px] text-[14px] leading-relaxed text-ink/55">{t.footer.line}</p>
        <p className="mt-2 max-w-[640px] text-[14px] text-ink/55">{t.footer.sources}</p>
      </div>
    </footer>
  );
}
