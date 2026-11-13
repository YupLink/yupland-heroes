// Дерево уровней: +1 уровень выбранному герою за ресурс.
//
// Дерево помогает один раз, поэтому между нажатием и списанием стоит экран
// подтверждения: игрок видит, КОГО прокачает и во что это обойдётся.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { growHeroLevel } from "@/server/api/beta-raid/tree-levelup";
import { priceLabel, type BuildingExtra, type ServicePrice } from "@/lib/buildingEffect";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { invalidateHeroQueries } from "@/lib/query";

type TreeExtra = Extract<NonNullable<BuildingExtra>, { kind: "leveltree" }>;

export function TreeLevelAction({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: TreeExtra;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();
  const [confirm, setConfirm] = useState<number | null>(null);

  // Цена — ключ словаря плюс число: фразу собираем на языке игрока.
  const priceText = (p: ServicePrice) => {
    const label = priceLabel(p);
    return t(label.key, label.params);
  };

  const grow = useMutation({
    // Шлём и номер варианта, и саму цену: если админ поменял настройки, пока
    // окно было открыто, сервер откажет вместо списания «другой» цены.
    mutationFn: (priceIndex: number) => {
      const p = extra.prices[priceIndex];
      if (!p) throw new Error(t("braid.tree_price_lost"));
      return growHeroLevel({
        data: {
          q,
          r,
          priceIndex,
          expect: { kind: p.kind, token: p.token ?? null, amount: p.amount },
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        t("braid.tree_grown_toast", {
          hero: res.heroName,
          n: res.level,
          paid: t(res.paidKey, res.paidParams),
        }),
      );
      // Дерево поднимает герою уровень — значит поехали все его экраны, а не
      // только окно постройки. Ключ «hero-selected» тут был выдуман: нужного
      // запроса с таким именем нет, и карточка героя оставалась старой.
      // Цена «в билетах» — золото ×500 (§8.61): шапка ресурсов видит трату сразу.
      invalidateHeroQueries(qc, ["my-resources", "my-like-balance"]);
      void qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      // Дерево «закрылось» на карте — зелёный флажок над ним должен появиться
      // сразу, без F5 (общий слой mine-flags, теперь и на использованных деревьях).
      void qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const hero = extra.hero;
  const chosen = confirm == null ? null : extra.prices[confirm];

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        {hero ? (
          <>
            <b>{hero.name}</b> ·{" "}
            <span className="text-muted-foreground">
              {/* Повышенный уровень выше потолка дерева — просто уровень, без «из». */}
              {hero.level > hero.maxLevel
                ? t("braid.field_lvl", { n: hero.level })
                : t("braid.lvl_of", { n: hero.level, max: hero.maxLevel })}
            </span>
          </>
        ) : (
          t("braid.tree_desc")
        )}
      </div>

      {extra.reasonKey && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}

      {chosen && hero ? (
        <>
          <p className="text-center text-sm">
            <b className="text-gold">
              {t("braid.tree_becomes", { hero: hero.name, n: hero.level + 1 })}
            </b>
            <br />
            <span className="text-[11px] text-muted-foreground">{t("braid.tree_once")}</span>
          </p>
          <button
            type="button"
            onClick={() => grow.mutate(confirm!)}
            disabled={grow.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {grow.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sprout className="h-4 w-4" />
            )}
            {t("braid.tree_grow_for", { price: priceText(chosen) })}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(null)}
            className="w-full text-center text-[11px] text-muted-foreground"
          >
            {t("braid.tree_other_price")}
          </button>
        </>
      ) : (
        <div className="space-y-1.5">
          {extra.prices.map((p, i) => (
            <button
              key={`${p.kind}:${p.token ?? ""}:${p.amount}`}
              type="button"
              onClick={() => setConfirm(i)}
              disabled={!extra.can}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3 text-sm font-semibold disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-2">
                <Sprout className="h-4 w-4 text-emerald-400" />
                {t("braid.plus_level")}
              </span>
              <span className="text-gold">{priceText(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
