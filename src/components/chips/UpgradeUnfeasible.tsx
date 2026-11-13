// Причина «почему нельзя улучшить» для авто-апгрейда фишки.
//
// Раньше при нехватке жертв ОДНОГО шаблона сервер отдавал feasible=false с
// пустым shortfall — и игрок видел голое «Невозможно улучшить» без причины.
// Теперь причина приходит структурно (missReason) и локализуется здесь.
import { useT, useLang } from "@/lib/i18n";
import { fmtGold } from "@/lib/craftGold";

type Short = { level: number; count: number };
export type MissReason = { kind: "same_type"; level: number } | { kind: "chips" };

export function UpgradeUnfeasible({
  shortfall,
  goldShortfall,
  needGold,
  haveGold,
  missReason,
  concise = false,
}: {
  shortfall?: Short[];
  /** Сколько золота не хватает на улучшение (0 — хватает). */
  goldShortfall: number;
  /** Цена плана и баланс — для отказа той же фразой, что у сервера (chips.upg_gold). */
  needGold: number;
  haveGold: number;
  missReason?: MissReason | null;
  concise?: boolean;
}) {
  const t = useT();
  const hasShort = !!shortfall && shortfall.length > 0;
  const ru = useLang() === "ru";
  const goldText = t("chips.upg_gold", { need: fmtGold(needGold, ru), have: fmtGold(haveGold, ru) });
  if (concise) return <div className="chip-upgrade__shortfall" role="status">
    <strong>{ru ? "Не хватает фишек для улучшения" : "Not enough chips to upgrade"}</strong>
    {hasShort && shortfall!.map((item, i) => {
      const n = item.count;
      const noun = n % 10 === 1 && n % 100 !== 11 ? "фишка" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "фишки" : "фишек";
      return <p key={i}>{ru ? `Нужно ещё ${n} ${noun} уровня ${String(item.level).replace(".", ",")}★` : `Need ${n} more ${item.level}★ chips`}</p>;
    })}
    {!hasShort && <p>{missReason?.kind === "same_type"
      ? (ru ? `Нужны фишки того же вида уровня ${String(missReason.level).replace(".", ",")}★` : `Need same-type ${missReason.level}★ chips`)
      : (ru ? "Подходящих фишек для этого улучшения пока нет." : "No suitable chips for this upgrade yet.")}</p>}
    {goldShortfall > 0 && <p>{goldText}</p>}
  </div>;
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300">
      {t("chips.cannot_upgrade")}
      {hasShort && (
        <div className="mt-2 space-y-1">
          {shortfall!.map((s, i) => (
            <div key={i}>· {t("chips.miss_level", { count: s.count, level: s.level })}</div>
          ))}
        </div>
      )}
      {goldShortfall > 0 && (
        <div className="mt-1">· {goldText}</div>
      )}
      {/* Ни фишек по уровню, ни золота не «не хватает» по счёту — значит дело
          в требовании одного шаблона. Без этой ветки причина была пустой. */}
      {!hasShort && goldShortfall <= 0 && (
        <div className="mt-2">
          ·{" "}
          {missReason?.kind === "same_type"
            ? t("chips.miss_same_type", { level: missReason.level })
            : t("chips.miss_chips")}
        </div>
      )}
    </div>
  );
}
