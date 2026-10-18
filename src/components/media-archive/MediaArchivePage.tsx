// Открытый архив картинок игры (владелец, 06.10.2026): разделы по категориям,
// фильтр чипами (можно несколько разом) и поиском, галки на картинке, разделе,
// подгруппе и «Выбрать всё», «Скачать ZIP» — архив с именами как в игре.
// Список живой: новая картинка в справочниках появляется сама (кэш минута).
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { getMediaArchive } from "@/server/api/media-archive";
import { ARCHIVE_CATS, type ArchiveCat } from "@/lib/mediaArchive";
import { ArchiveSection } from "./ArchiveSection";
import { useArchiveZip } from "./useArchiveZip";

const chip = (on: boolean) =>
  `shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
    on ? "border-gold bg-gold/20 text-gold" : "border-border text-muted-foreground"
  }`;

export function MediaArchivePage() {
  const t = useT();
  const lang = useLang();
  const q = useQuery({
    queryKey: ["media-archive"],
    queryFn: () => getMediaArchive(),
    staleTime: 60_000,
    retry: 3,
  });
  const items = useMemo(() => q.data ?? [], [q.data]);
  const [cats, setCats] = useState<ArchiveCat[]>([]);
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const zip = useArchiveZip();

  const counts = useMemo(() => {
    const m = new Map<ArchiveCat, number>();
    for (const it of items) m.set(it.cat, (m.get(it.cat) ?? 0) + 1);
    return m;
  }, [items]);
  const needle = search.trim().toLowerCase();
  const visible = items.filter(
    (it) =>
      (cats.length === 0 || cats.includes(it.cat)) &&
      (!needle || it.name.toLowerCase().includes(needle)),
  );
  const groups = ARCHIVE_CATS.map((c) => ({
    cat: c,
    items: visible.filter((it) => it.cat === c.id),
  })).filter((g) => g.items.length > 0);
  const picked = items.filter((it) => checked.has(it.key));

  const toggle = useCallback(
    (key: string) =>
      setChecked((s) => {
        const n = new Set(s);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      }),
    [],
  );
  const toggleMany = useCallback(
    (keys: string[], on: boolean) =>
      setChecked((s) => {
        const n = new Set(s);
        for (const k of keys) {
          if (on) n.add(k);
          else n.delete(k);
        }
        return n;
      }),
    [],
  );
  const toggleCat = (id: ArchiveCat) =>
    setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const download = async () => {
    const res = await zip.run(picked);
    if (res.saved > 0) toast.success(t("archive.saved", { n: res.saved }));
    if (res.failed > 0) toast.error(t("archive.failed", { n: res.failed }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-6xl px-4 pb-2 pt-6">
        <h1 className="font-display text-2xl font-bold">{t("archive.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("archive.count", { n: items.length })} ·{" "}
          <Link to="/archive/yuplink-game-params-guide" className="font-semibold text-gold">
            {t("archive.to_guide")}
          </Link>
        </p>
      </header>

      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("archive.search")}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={download}
              disabled={picked.length === 0 || zip.progress.running}
              className="flex shrink-0 items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {zip.progress.running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("archive.zipping", { done: zip.progress.done, total: zip.progress.total })}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t("archive.zip")}
                  {picked.length > 0 && ` · ${picked.length}`}
                </>
              )}
            </button>
          </div>
          {/* На телефоне чипы — одной строкой с прокруткой: в шесть строк липкая
              панель закрывала бы полэкрана. */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <button type="button" onClick={() => setCats([])} className={chip(cats.length === 0)}>
              {t("archive.all")}
            </button>
            {ARCHIVE_CATS.filter((c) => (counts.get(c.id) ?? 0) > 0).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCat(c.id)}
                className={chip(cats.includes(c.id))}
              >
                {lang === "en" ? c.en : c.ru}
                <span className="ml-1 opacity-60">{counts.get(c.id)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() =>
                toggleMany(
                  visible.map((it) => it.key),
                  true,
                )
              }
              className="font-semibold text-gold"
            >
              {t("archive.select_all")}
            </button>
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="text-muted-foreground"
            >
              {t("archive.clear")}
            </button>
            <span className="ml-auto text-muted-foreground">
              {t("archive.selected", { n: picked.length })}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-4 pb-24">
        {q.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("archive.loading")}
          </div>
        ) : q.isError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            {t("archive.load_error")}
            <button
              type="button"
              onClick={() => q.refetch()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
            >
              {t("archive.retry")}
            </button>
          </div>
        ) : groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("archive.empty")}</p>
        ) : (
          groups.map((g) => (
            <ArchiveSection
              key={g.cat.id}
              title={lang === "en" ? g.cat.en : g.cat.ru}
              items={g.items}
              checked={checked}
              onToggle={toggle}
              onToggleMany={toggleMany}
              downloadLabel={t("archive.download_one")}
              noSubLabel={t("archive.no_group")}
            />
          ))
        )}
      </main>
    </div>
  );
}
