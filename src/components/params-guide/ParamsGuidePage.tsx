// Открытый справочник параметров игры (владелец, 12.10.2026): что значат
// характеристики героя, раса и класс, параметры боссов, объекты карты, постройки,
// город и замок — коротко, где и зачем. Рядом с архивом картинок, тот же вид:
// чипы разделов (можно несколько), поиск, ссылка на архив.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLang, useT } from "@/lib/i18n";
import { GuideCard } from "./GuideCard";
import { GUIDE_SECTIONS, filterGuide } from "./guideSections";
import { pick, type GuideLang } from "./guideTypes";

const chip = (on: boolean) =>
  `shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
    on ? "border-gold bg-gold/20 text-gold" : "border-border text-muted-foreground"
  }`;

export function ParamsGuidePage() {
  const t = useT();
  const lang: GuideLang = useLang() === "en" ? "en" : "ru";
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const shown = useMemo(
    () => filterGuide(GUIDE_SECTIONS, picked, search, lang),
    [picked, search, lang],
  );
  const total = GUIDE_SECTIONS.reduce((n, s) => n + s.entries.length, 0);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-6xl px-4 pb-2 pt-6">
        <h1 className="font-display text-2xl font-bold">{t("guide.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("guide.count", { n: total })} ·{" "}
          <Link to="/archive/yuplink-game-art-all-images" className="font-semibold text-gold">
            {t("guide.to_archive")}
          </Link>
        </p>
      </header>

      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("guide.search")}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          {/* На телефоне — одна строка с прокруткой, как у архива картинок. */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <button
              type="button"
              onClick={() => setPicked([])}
              className={chip(picked.length === 0)}
            >
              {t("guide.all")}
            </button>
            {GUIDE_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={chip(picked.includes(s.id))}
              >
                {pick(s.title, lang)}
                <span className="ml-1 opacity-60">{s.entries.length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-4 pb-24">
        {shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("guide.empty")}</p>
        ) : (
          shown.map((s) => (
            <section key={s.id} id={`s-${s.id}`}>
              <h2 className="mb-3 font-display text-xl font-bold">{pick(s.title, lang)}</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {s.entries.map((e) => (
                  <GuideCard key={e.id} entry={e} lang={lang} whereLabel={t("guide.where")} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
