// Что достанется каждому месту — по тем же формулам, что и реальная раздача.
//
// Игрок видит «награды по местам», но до боя не понимал, что именно получит
// лично он. Считаем распределение заранее и показываем в таблице мест.
// ВАЖНО: формулы обязаны совпадать с encounter-payout.ts, иначе обещание
// разойдётся с выдачей.
import type { RewardConfig } from "../raid-shared";
import { moneyByPlace } from "./encounter-share";
import { moneyOnly, extraByPlace } from "./encounter-extra";

export type PlacePrize = { kind: string; amount: number; packId: string | null };

/**
 * Призы по местам: индекс массива — место минус один.
 *
 * @param places сколько мест реально занято (по числу участников)
 */
export function prizesByPlace(cfg: RewardConfig, places: number): PlacePrize[][] {
  const out: PlacePrize[][] = Array.from({ length: Math.max(0, places) }, () => []);
  if (places <= 0) return out;

  // Делимое считает общий модуль — обещание в таблице мест обязано совпасть
  // с реальной раздачей (encounter-payout зовёт ту же функцию).
  const money = moneyByPlace(moneyOnly(cfg), places);
  for (let i = 0; i < money.length; i++) {
    for (const row of money[i]) out[i].push({ kind: row.kind, amount: row.amount, packId: null });
  }

  // Ресурсы и свои товары — тем же модулем, что и в выдаче. У ресурса в kind
  // кладём КОД (gold/stone/…): подписи ресурсов у клиента уже есть, а «resource»
  // игроку ничего не говорит.
  const extras = extraByPlace(cfg, places);
  for (let i = 0; i < extras.length; i++) {
    for (const row of extras[i]) {
      out[i].push({
        kind: row.kind === "resource" ? row.ref : "custom",
        amount: row.amount,
        packId: row.ref,
      });
    }
  }

  for (const pk of cfg.packs) {
    if (!pk.packId || pk.toPlace <= 0) continue;
    for (let i = 0; i < Math.min(pk.toPlace, places); i++) {
      out[i].push({ kind: "pack", amount: 1, packId: pk.packId });
    }
  }

  for (const it of cfg.items ?? []) {
    if (!it.itemTemplateId || it.toPlace <= 0) continue;
    for (let i = 0; i < Math.min(it.toPlace, places); i++) {
      out[i].push({ kind: "item", amount: 1, packId: it.itemTemplateId });
    }
  }

  return out;
}
