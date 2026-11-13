// Вкладка «Игрок» лавки зачарования (прототип v3): ячейка артефакта («+» →
// попап выбора), ячейки заклинаний и инфо выбранного, усиление шанса (если у заклинания fx.on),
// итог цены и «Зачаровать». Итог попытки — под кнопкой.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  enchantOdds,
  type EnchantArtifactView,
  type EnchantSpellView,
} from "@/lib/enchant/enchant";
import {
  ENCHANT_ARTS_KEY,
  useEnchantArts,
  type EnchantAt,
} from "@/components/beta-raid/enchant/enchantQueries";
import { canPay, spellChips, totalChips } from "@/components/beta-raid/enchant/enchantView";
import { spellsByRarity } from "@/components/beta-raid/enchant/enchantPlayerView";
import { CostChips } from "@/components/beta-raid/enchant/EnchantBits";
import { EnchantArtCell } from "@/components/beta-raid/enchant/EnchantArtCell";
import { EnchantArtPicker } from "@/components/beta-raid/enchant/EnchantArtPicker";
import { EnchantSpellCell } from "@/components/beta-raid/enchant/EnchantSpellCell";
import { EnchantBoost } from "@/components/beta-raid/enchant/EnchantBoost";
import { EnchantSpellInfo } from "@/components/beta-raid/enchant/EnchantSpellInfo";
import { EnchantResult, type EnchantOutcome } from "@/components/beta-raid/enchant/EnchantResult";
import { useEnchantRun, type EnchantTry } from "@/components/beta-raid/enchant/useEnchantRun";

export function EnchantPlayer({ at, spells }: { at: EnchantAt; spells: EnchantSpellView[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [artId, setArtId] = useState<string | null>(null);
  // Снимок из попапа: ячейка рисуется сразу, пока список не перечитан.
  const [artSnap, setArtSnap] = useState<EnchantArtifactView | null>(null);
  const [picking, setPicking] = useState(false);
  const [spellId, setSpellId] = useState<string | null>(null);
  const [steps, setSteps] = useState(0);
  const [result, setResult] = useState<{ res: EnchantOutcome; artName: string } | null>(null);

  const arts = useEnchantArts(artId != null);
  const art = artId ? (arts.data?.find((a) => a.itemId === artId) ?? artSnap) : null;
  // Легендарные сверху, обычные снизу; по умолчанию выбрана первая ячейка.
  const shown = spellsByRarity(spells);
  const spell = shown.find((s) => s.id === spellId) ?? shown[0];
  const k = spell?.fx.on ? steps : 0;
  const total = spell ? totalChips(spell, k) : [];

  // Ответ сервера — сразу в кэш списка: зачарованный получает ✦ и новые статы,
  // разрушенный пропадает, не дожидаясь перечитки (кнопка не мигнёт активной).
  const onResult = (res: EnchantOutcome, v: EnchantTry) => {
    setResult({ res, artName: art?.name ?? "" });
    setSteps(0);
    const enchant = { pct: res.pct ?? 0, spellName: spell?.name ?? "" };
    const done = (a: EnchantArtifactView): EnchantArtifactView =>
      a.itemId === v.itemId ? { ...a, stats: res.after ?? a.stats, enchant } : a;
    qc.setQueryData<EnchantArtifactView[]>(ENCHANT_ARTS_KEY, (list) => {
      if (!list) return list;
      if (res.outcome === "gone") return list.filter((a) => a.itemId !== v.itemId);
      return res.outcome === "ok" ? list.map(done) : list;
    });
    if (res.outcome === "ok") setArtSnap((s) => (s ? done(s) : s));
    if (res.outcome === "gone") {
      setArtId(null);
      setArtSnap(null);
    }
  };
  const run = useEnchantRun(at, onResult);

  if (!spell) return null;
  const can = !!art && !art.enchant && canPay(total) && !run.isPending;

  return (
    <>
      <div>
        <h4 className="ench-h">{t("enchantshop.artifact")}</h4>
        <div className="ench-cells">
          {art ? (
            <EnchantArtCell a={art} pressed={false} onClick={() => setPicking(true)} />
          ) : (
            <button
              type="button"
              className="ench-cell ench-slot-empty"
              aria-label={t("enchantshop.pick_art")}
              onClick={() => setPicking(true)}
            >
              +
            </button>
          )}
        </div>
      </div>

      <div>
        <h4 className="ench-h">{t("enchantshop.spell")}</h4>
        <div className="ench-cells is-spells">
          {shown.map((s) => (
            <EnchantSpellCell
              key={s.id}
              player
              name={s.name}
              rarity={s.rarity}
              boost={[s.boostMin, s.boostMax]}
              odds={enchantOdds(s, 0)}
              chips={spellChips(s)}
              pressed={s.id === spell.id}
              onClick={() => {
                setSpellId(s.id);
                setSteps(0);
              }}
            />
          ))}
        </div>
      </div>

      {/* Превью статов — только у выбранного и ещё не зачарованного (его не зачаровать). */}
      <EnchantSpellInfo spell={spell} steps={k} stats={art && !art.enchant ? art.stats : null} />

      {spell.fx.on && <EnchantBoost spell={spell} steps={k} onSteps={setSteps} />}

      <div className="ench-pay">
        <CostChips list={total} className="ench-total" />
        <button
          type="button"
          className="ench-go"
          disabled={!can}
          onClick={() => art && run.mutate({ spellId: spell.id, itemId: art.itemId, steps: k })}
        >
          {run.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("enchantshop.go")}
        </button>
      </div>

      {result && <EnchantResult res={result.res} artName={result.artName} />}

      {picking && (
        <EnchantArtPicker
          value={artId}
          onPick={(a) => {
            setArtId(a.itemId);
            setArtSnap(a);
            setResult(null);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
