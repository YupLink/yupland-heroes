// Ресурсы и свои товары в награде объекта: как они делятся по местам.
//
// Делимое (лайки/билеты/токены/энергия) считает moneyByPlace, и его формулы
// не трогаем — по ним прямо сейчас идут живые выплаты. Новые виды считаются
// РЯДОМ, теми же долями участников:
//   • РЕСУРС — фонд, делится долями, но ЦЕЛЫМИ: пол-камня не бывает;
//   • СВОЙ ТОВАР — штучно, «до места N», как пак: у первого места не должно
//     появиться 0,37 слитка железа.
import type { RewardConfig } from "../raid-shared";
import { isExtraFiller, fillerRef } from "../reward-filler";
import { participantShares } from "./encounter-share";

export type ExtraShare = { kind: "resource" | "custom"; ref: string; amount: number };

/** Конфиг без новых видов — ровно то, что умеет делить moneyByPlace. */
export function moneyOnly(cfg: RewardConfig): RewardConfig {
  return { ...cfg, fillers: cfg.fillers.filter((f) => !isExtraFiller(f)) };
}

/**
 * Ресурсы и товары по местам: индекс массива — место минус один.
 *
 * Хвост округлений у ресурса забирает последний участник, иначе фонд «худеет»
 * на единицы. Товар не делится вовсе: каждое место из первых N получает
 * настроенное количество целиком.
 */
export function extraByPlace(cfg: RewardConfig, participants: number): ExtraShare[][] {
  const out: ExtraShare[][] = Array.from({ length: Math.max(0, participants) }, () => []);
  if (participants <= 0) return out;

  const shares = participantShares(cfg.split, participants);
  for (const fl of cfg.fillers) {
    const ref = fillerRef(fl);
    if (!ref || !(fl.amount > 0)) continue;

    if (fl.kind === "custom") {
      const toPlace = Math.max(1, Math.floor(fl.toPlace ?? 1));
      for (let i = 0; i < Math.min(toPlace, participants); i++) {
        out[i].push({ kind: "custom", ref, amount: fl.amount });
      }
      continue;
    }

    let given = 0;
    for (let i = 0; i < participants; i++) {
      const last = i === participants - 1;
      let amt = last ? Math.round(fl.amount) - given : Math.round(fl.amount * shares[i]);
      if (given + amt > fl.amount) amt = Math.floor(fl.amount - given);
      if (!(amt > 0)) continue;
      given += amt;
      out[i].push({ kind: "resource", ref, amount: amt });
    }
  }
  return out;
}
