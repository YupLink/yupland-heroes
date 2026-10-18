// Лейбл уровня в нашем стиле:
//   1.0 → «1lvl», 1.5 → «1lvl+», 2.0 → «2lvl», 2.5 → «2lvl+», ..., 5 → «5lvl»
// (дробная половина = «+», как у CapsGame Common/Common+ маппится на наше «1lvl/1lvl+»)
//
// Общий модуль: используется и в инвентаре (chips.tsx), и в экране PvE-босса
// (BossScreen.tsx), чтобы подпись уровня была одинаковой везде.
export function labelForLevel(lvl: number): string {
  const base = Math.floor(lvl);
  const isPlus = Math.round(lvl * 2) % 2 === 1;
  return `${base}lvl${isPlus ? "+" : ""}`;
}
