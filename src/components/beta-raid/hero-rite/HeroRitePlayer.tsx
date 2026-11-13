// Вкладка «Игрок» зачарования героев — по образцу лавки артефактов: ячейки
// обрядов (эпические — сверху), ячейки героев («+» → выбор сразу нескольких),
// инфо выбранного обряда (что выйдет, шансы, сколько пропадёт), цена и
// «Зачаровать». Итог — под кнопкой.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { mergeEnchantCost } from "@/lib/enchant/enchant";
import {
  HERO_RITE_NEXT,
  riteKeepsFirst,
  loseText,
  riteOdds,
  type HeroRiteResult,
  type HeroRiteView,
  type RiteHero,
} from "@/lib/enchant/heroRite";
import { canPay, costChips, oddsText } from "@/components/beta-raid/enchant/enchantView";
import { CostChips } from "@/components/beta-raid/enchant/EnchantBits";
import {
  riteHeroesKey,
  useRiteHeroes,
  type RiteAt,
} from "@/components/beta-raid/hero-rite/heroRiteQueries";
import { HeroRiteCell } from "@/components/beta-raid/hero-rite/HeroRiteCell";
import { HeroRitePicker } from "@/components/beta-raid/hero-rite/HeroRitePicker";
import { HeroRiteResultView, RiteHeroCell } from "@/components/beta-raid/hero-rite/HeroRiteBits";
import { useHeroRiteRun } from "@/components/beta-raid/hero-rite/useHeroRiteRun";

/** Старшие обряды сверху (легендарные, эпические, редкие); внутри — как поставил админ. */
const RANK = { legendary: 2, epic: 1, rare: 0 } as const;
const byRarity = (list: HeroRiteView[]) =>
  [...list].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);

export function HeroRitePlayer({ at, rites }: { at: RiteAt; rites: HeroRiteView[] }) {
  const t = useT();
  const qc = useQueryClient();
  const shown = byRarity(rites);
  const [riteId, setRiteId] = useState<string | null>(null);
  const rite = shown.find((s) => s.id === riteId) ?? shown[0];
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<HeroRiteResult | null>(null);
  const heroes = useRiteHeroes(rite?.rarity ?? "rare", !!rite);

  const run = useHeroRiteRun(at, (res) => {
    setResult(res);
    setPicked([]);
    // Ушедшие пропадают из списка сразу, не дожидаясь перечитки.
    const gone = new Set(res.lost.map((h) => h.itemId));
    if (rite)
      qc.setQueryData<RiteHero[]>(riteHeroesKey(rite.rarity), (list) =>
        list ? list.filter((h) => !gone.has(h.itemId)) : list,
      );
  });

  if (!rite) return null;
  const target = HERO_RITE_NEXT[rite.rarity];
  // «→ уник»: уником станет герой первой ячейки (★), а не новый.
  const keepsFirst = riteKeepsFirst(rite.rarity);
  const free = heroes.data ?? [];
  const chosen = picked
    .map((id) => free.find((h) => h.itemId === id))
    .filter((h): h is RiteHero => !!h)
    .slice(0, rite.need);
  const odds = riteOdds(rite);
  const total = costChips(mergeEnchantCost(rite.cost), rite.cost, true);
  const can = chosen.length === rite.need && canPay(total) && !run.isPending;
  const choose = (id: string) => {
    if (id === rite.id) return;
    setRiteId(id);
    setPicked([]);
    setResult(null);
  };
  const slots = Array.from({ length: rite.need }, (_, i) => chosen[i] ?? null);

  return (
    <>
      <div>
        <h4 className="ench-h">{t("herorite.rite")}</h4>
        <div className="ench-cells is-spells">
          {shown.map((s) => (
            <HeroRiteCell
              key={s.id}
              player
              name={s.name}
              rarity={s.rarity}
              need={s.need}
              odds={riteOdds(s)}
              chips={costChips(s.cost, s.cost, true)}
              pressed={s.id === rite.id}
              onClick={() => choose(s.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <h4 className="ench-h">{t("herorite.heroes")}</h4>
        <div className="ench-cells">
          {slots.map((h, i) =>
            h ? (
              <RiteHeroCell
                key={h.itemId}
                h={h}
                pressed={false}
                first={keepsFirst && i === 0}
                onClick={() => setPicking(true)}
              />
            ) : (
              <button
                key={`slot-${i}`}
                type="button"
                className="ench-cell ench-slot-empty"
                aria-label={t("herorite.pick")}
                onClick={() => setPicking(true)}
              >
                +
              </button>
            ),
          )}
        </div>
      </div>

      <div className={`ench-info ench-r-${target}`}>
        <div className="ench-info-h">
          <h5>{rite.name}</h5>
          <span className="ench-rt">
            {t(`herorite.r_${rite.rarity}`)} ×{rite.need} → {t(`herorite.r_${target}`)}
          </span>
        </div>
        <p>
          <span className="is-s">
            {keepsFirst
              ? t("herorite.info_unique", {
                  n: oddsText(odds.success),
                  name: chosen[0]?.name ?? t("herorite.info_first"),
                })
              : t("herorite.info_success", {
                  n: oddsText(odds.success),
                  r: t(`herorite.r_${target}`),
                })}
          </span>
        </p>
        {odds.success < 100 && (
          <p className={rite.loseMax > 0 ? "ench-warn" : undefined}>
            {rite.loseMax > 0
              ? t("herorite.info_lose", {
                  n: oddsText(100 - odds.success),
                  k: loseText(rite.loseMin, rite.loseMax),
                  need: rite.need,
                })
              : t("herorite.info_keep", { n: oddsText(100 - odds.success) })}
          </p>
        )}
        {!keepsFirst && <p>{t("herorite.info_level")}</p>}
      </div>

      <div className="ench-pay">
        <CostChips list={total} className="ench-total" />
        <button
          type="button"
          className="ench-go"
          disabled={!can}
          onClick={() => run.mutate({ riteId: rite.id, heroIds: chosen.map((h) => h.itemId) })}
        >
          {run.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("herorite.go")}
        </button>
      </div>

      {result && <HeroRiteResultView res={result} />}

      {picking && (
        <HeroRitePicker
          rarity={rite.rarity}
          need={rite.need}
          value={picked}
          onPick={(ids) => {
            setPicked(ids);
            setResult(null);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
