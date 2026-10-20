"use client";

import { useEffect, useState } from "react";
import { useLang, CLASS_KEYS } from "@/i18n";
import type { ClassKey } from "@/i18n";
import { Banner, Nav, Footer } from "@/components/chrome";
import StreetFinder from "@/components/StreetFinder";
import { CLASS_COLOURS } from "@/components/FreeMap";
import Developers from "@/components/Developers";

interface Summary {
  streets: number;
  segments: number;
  total_length_km: number;
  classes: Record<ClassKey, { streets: number; segments: number; length_km: number }>;
}

function fmt(n: number) {
  return n.toLocaleString("en-CA");
}

function Hero() {
  const { t } = useLang();
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    fetch("/api/v1/parking/summary")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);
  return (
    <section className="mx-auto max-w-[1392px] px-6 pb-4 pt-14 md:pt-20">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/60">{t.hero.kicker}</p>
      <h1 className="display mt-5 max-w-[900px] text-[52px] md:text-[76px]">{t.hero.title}</h1>
      <p className="mt-6 max-w-[760px] text-[20px] leading-relaxed text-ink/70">{t.hero.lead}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href="#explorer" className="rounded-full bg-canada px-7 py-3.5 text-[16px] font-semibold text-white hover:bg-canada/90">
          {t.hero.cta1}
        </a>
        <a href="#howto" className="rounded-full border border-line px-7 py-3.5 text-[16px] font-semibold hover:border-ink">
          {t.hero.cta2}
        </a>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CLASS_KEYS.map((k) => (
          <div key={k} className="rounded-[20px] border border-line bg-cream p-6">
            <span className="mb-3 block h-[8px] w-12 rounded-full" style={{ background: CLASS_COLOURS[k] }} />
            <p className="display text-[34px]">{summary ? fmt(summary.classes[k].streets) : "…"}</p>
            <p className="mt-1 text-[14.5px] leading-snug text-ink/65">{t.statsLabels[k]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowTo() {
  const { t } = useLang();
  return (
    <section id="howto" className="mx-auto max-w-[1392px] scroll-mt-24 px-6 py-20">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/60">{t.howto.kicker}</p>
      <h2 className="display mt-4 max-w-[820px] text-[40px] md:text-[52px]">{t.howto.title}</h2>
      <p className="mt-5 max-w-[760px] text-[18px] leading-relaxed text-ink/70">{t.howto.intro}</p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {CLASS_KEYS.map((k) => (
          <article key={k} className="rounded-[20px] border border-line bg-white p-6">
            <span className="mb-3 block h-[8px] w-12 rounded-full" style={{ background: CLASS_COLOURS[k] }} />
            <h3 className="text-[19px] font-semibold">{t.classNames[k]}</h3>
            <p className="mt-2 text-[15.5px] leading-relaxed text-ink/70">{t.howto.defs[k]}</p>
          </article>
        ))}
      </div>

      <div className="mt-12 max-w-[820px]">
        <h3 className="text-[24px] font-semibold">{t.howto.precedenceTitle}</h3>
        <ol className="mt-4 list-decimal space-y-2.5 pl-6 text-[16.5px] leading-relaxed text-ink/75">
          {t.howto.precedence.map((p) => (
            <li key={p.slice(0, 24)}>{p}</li>
          ))}
        </ol>
        <p className="mt-5 text-[16.5px] leading-relaxed text-ink/75">{t.howto.streetLevelNote}</p>
      </div>

      <div className="mt-10 max-w-[820px] rounded-[20px] border-2 border-canada/60 bg-cream px-7 py-6">
        <h3 className="text-[20px] font-semibold">{t.howto.honestyTitle}</h3>
        <p className="mt-2 text-[17px] leading-relaxed text-ink/85">{t.howto.honesty}</p>
      </div>

      <div className="mt-6 max-w-[820px] rounded-[20px] border border-line bg-white px-7 py-6">
        <h3 className="text-[20px] font-semibold">{t.howto.paidTitle}</h3>
        <p className="mt-2 text-[16.5px] leading-relaxed text-ink/75">{t.howto.paidBody}</p>
      </div>
    </section>
  );
}

function Methodology() {
  const { t } = useLang();
  return (
    <section id="methodology" className="mx-auto max-w-[1392px] scroll-mt-24 px-6 py-20">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/60">{t.methodology.kicker}</p>
      <h2 className="display mt-4 max-w-[820px] text-[40px] md:text-[52px]">{t.methodology.title}</h2>
      <ol className="mt-10 max-w-[860px] list-decimal space-y-5 pl-6">
        {t.methodology.points.map((p) => (
          <li key={p.slice(0, 32)} className="text-[17px] leading-relaxed text-ink/75">{p}</li>
        ))}
      </ol>
    </section>
  );
}

function Downloads() {
  const { t } = useLang();
  const files = [
    { href: "/data/free_parking_streets.csv", label: t.downloads.streetsCsv, meta: "CSV · 13,344 rows" },
    { href: "/data/free_parking_sections.csv", label: t.downloads.sectionsCsv, meta: "CSV · 50,027 rows" },
    { href: "/data/data_dictionary.md", label: t.downloads.dict, meta: "Markdown" },
  ];
  return (
    <section id="data" className="mx-auto max-w-[1392px] scroll-mt-24 px-6 pb-24">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/60">{t.downloads.kicker}</p>
      <h2 className="display mt-4 text-[40px] md:text-[52px]">{t.downloads.title}</h2>
      <p className="mt-5 max-w-[760px] text-[18px] leading-relaxed text-ink/70">{t.downloads.body}</p>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {files.map((f) => (
          <a key={f.href} href={f.href} download className="rounded-[20px] border border-line bg-white p-6 hover:border-ink">
            <h3 className="text-[18px] font-semibold leading-snug">{f.label}</h3>
            <p className="mt-1 text-[14px] text-ink/55">{f.meta}</p>
            <span className="mt-4 inline-block rounded-full bg-canada px-4 py-2 text-[13.5px] font-semibold text-white">
              {t.downloads.download}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Banner />
      <Nav />
      <main>
        <Hero />
        <section className="mx-auto max-w-[1392px] px-6 pt-10">
          <StreetFinder />
        </section>
        <HowTo />
        <Developers />
        <Methodology />
        <Downloads />
      </main>
      <Footer />
    </>
  );
}
