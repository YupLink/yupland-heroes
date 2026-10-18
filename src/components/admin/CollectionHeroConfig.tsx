// Настройка «фишка → герой» на коллекцию: даёт ли она героев, какая раса,
// шансы специализаций и (опционально) сузить пул конкретными шаблонами.
// Используется и в карточке коллекции, и в обзоре вкладки «Герои».
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adminGetCollectionHeroConfig,
  adminSetCollectionHeroConfig,
} from "@/server/api/collectionHero";
import { adminListItems } from "@/server/api/items";
import { RACES, SPECIALIZATIONS } from "@/components/heroMeta";
import { humanError } from "@/lib/humanError";

/** Равные шансы по умолчанию: 100% на 6 специализаций (17+17+17+17+16+16). */
function equalWeights(): Record<string, number> {
  const base = Math.floor(100 / SPECIALIZATIONS.length); // 16
  const rest = 100 - base * SPECIALIZATIONS.length; // 4 → первым четырём +1
  const w: Record<string, number> = {};
  SPECIALIZATIONS.forEach((s, i) => {
    w[s] = base + (i < rest ? 1 : 0);
  });
  return w;
}

export function CollectionHeroConfig({
  collectionId,
  defaultOpen = false,
}: {
  collectionId: string;
  defaultOpen?: boolean;
}) {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["collection-hero-cfg", collectionId],
    queryFn: () => adminGetCollectionHeroConfig({ data: { collectionId } }),
  });
  const heroesQ = useQuery({
    queryKey: ["admin-items", "hero"],
    queryFn: () => adminListItems({ data: { kind: "hero" } }),
    staleTime: 60_000,
  });

  const [active, setActive] = useState(false);
  const [race, setRace] = useState("");
  const [weights, setWeights] = useState<Record<string, number>>(equalWeights);
  const [heroIds, setHeroIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded || cfg.isLoading) return;
    const d = cfg.data;
    if (d) {
      setActive(d.active);
      setRace(d.race ?? "");
      // Сохранённые шансы; если их нет — стартуем с равных, а не с нулей.
      if (d.specWeights.length > 0) {
        const w: Record<string, number> = {};
        for (const s of d.specWeights) w[s.spec] = s.weight;
        setWeights(w);
      }
      setHeroIds(d.heroTemplateIds);
    }
    setLoaded(true);
  }, [cfg.isLoading]);

  const save = useMutation({
    mutationFn: () =>
      adminSetCollectionHeroConfig({
        data: {
          collectionId,
          active,
          race: race || null,
          specWeights: SPECIALIZATIONS.filter((s) => (weights[s] ?? 0) > 0).map((s) => ({
            spec: s,
            weight: weights[s],
          })),
          heroTemplateIds: heroIds,
        },
      }),
    onSuccess: () => {
      toast.success("Настройка героя сохранена");
      qc.invalidateQueries({ queryKey: ["collection-hero-cfg", collectionId] });
      qc.invalidateQueries({ queryKey: ["hero-sources"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const raceHeroes = (heroesQ.data ?? []).filter((h) => !race || h.race === race);
  const weightSum = SPECIALIZATIONS.reduce((s, k) => s + (weights[k] || 0), 0);

  return (
    <details
      open={defaultOpen}
      className="mt-3 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.04]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold text-fuchsia-300">
        <span className="inline-flex items-center gap-1.5">
          <Crown className="h-3.5 w-3.5" /> Герой из коллекции
        </span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {cfg.data?.active ? `вкл · ${cfg.data.race || "раса?"}` : "выкл"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-fuchsia-500/15 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActive((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold transition",
              active
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-border text-muted-foreground",
            )}
          >
            {active ? "коллекция даёт героев" : "выключено"}
          </button>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Раса
            <select
              value={race}
              onChange={(e) => setRace(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {RACES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setWeights(equalWeights())}
            className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground"
          >
            шансы поровну
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Специализация — шанс, % (выпадает одна):</span>
            <span
              className={cn(
                "font-mono font-bold",
                weightSum === 100 ? "text-emerald-400" : "text-amber-400",
              )}
            >
              Σ {weightSum}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SPECIALIZATIONS.map((s) => (
              <label
                key={s}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
              >
                <span className="min-w-0 flex-1 truncate">{s}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={weights[s] ?? 0}
                  onChange={(e) =>
                    setWeights((w) => ({
                      ...w,
                      [s]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-12 rounded-md border border-border bg-secondary/40 px-1 py-0.5 text-center tabular-nums"
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">
            Пул героев — кого можно получить.{" "}
            <span className="text-muted-foreground/70">
              Ничего не выбрано = любой герой расы; ярус (3★/4★/5★) подбирается
              по уровню сожжённой фишки.
            </span>
          </div>
          {heroesQ.isLoading ? (
            <div className="text-[11px] text-muted-foreground">загрузка…</div>
          ) : raceHeroes.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">
              {race ? `нет героев расы «${race}»` : "выбери расу"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {raceHeroes.map((h) => {
                const on = heroIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() =>
                      setHeroIds((ids) =>
                        on ? ids.filter((x) => x !== h.id) : [...ids, h.id],
                      )
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] transition",
                      on
                        ? "border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-200"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {h.name}
                    {h.specialization && (
                      <span className="ml-1 opacity-60">· {h.specialization}</span>
                    )}
                    {h.level != null && (
                      <span className="ml-1 opacity-60">· {h.level}★</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full rounded-full bg-gold px-4 py-2 text-xs font-bold text-background transition active:scale-95 disabled:opacity-50"
        >
          {save.isPending ? "Сохраняю…" : "Сохранить настройку героя"}
        </button>
      </div>
    </details>
  );
}
