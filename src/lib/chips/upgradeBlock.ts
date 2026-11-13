// Ответ пакетной проверки «можно ли улучшить» (server/api/chips-upgrade-ready)
// и подписи причин. Общий для сервера и клиента: типы и текст, без правил —
// правила улучшения живут только на сервере.

/** Почему нельзя. Порядок проверок — как у самого улучшения. */
export type UpgradeBlock =
  | { kind: "listed" }
  | { kind: "studying" }
  | { kind: "unavailable" }
  | { kind: "resting"; until: string }
  | { kind: "max" }
  | { kind: "no_rules" }
  /** Нужны фишки ОДНОГО вида этого уровня, а их не хватает. */
  | { kind: "same_type"; level: number }
  /** Не хватает фишек: сколько каких уровней. */
  | { kind: "chips"; shortfall: Array<{ level: number; count: number }> }
  /** Не хватает золота на улучшение (цена по текущему курсу). */
  | { kind: "gold"; need: number; have: number };

export type ChipUpgradeState =
  /** gold — цена улучшения с автоподбором в золоте, burn — сколько фишек сгорит. */
  { can: true; gold: number; burn: number } | { can: false; reason: UpgradeBlock };

export type UpgradeReadiness = {
  haveGold: number;
  /** id фишки → состояние. Нет id в ответе (тренировочная) — улучшить нельзя. */
  chips: Record<string, ChipUpgradeState>;
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

const num = (n: number) => String(Math.round(n * 100) / 100);

/** Причина одной строкой: «Не хватает золота: нужно 1059, у тебя 120». */
export function upgradeBlockText(r: UpgradeBlock, t: TFn): string {
  switch (r.kind) {
    case "same_type":
      return t("chips.upg_same_type", { level: num(r.level) });
    case "chips":
      return t("chips.upg_chips", {
        list: r.shortfall.map((s) => `${s.count} × ${num(s.level)}★`).join(", "),
      });
    case "gold":
      return t("chips.upg_gold", { need: num(r.need), have: num(r.have) });
    default:
      return t(`chips.upg_${r.kind}`);
  }
}
