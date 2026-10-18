// Награда за опустошённый объект: общая для боя и для подбора.
//
// Валюты, ресурсы счёта, паки и предметы-артефакты не начисляем сразу — кладём
// в очередь получения (reward-queue): игрок видит «Добычу» и забирает сам.
// Свой товар (предмет рюкзака) — сразу в рюкзак выбранного героя, а что не
// влезло — мешочком на клетке объекта (владелец, 29.09.2026; ПРАВИЛА §8.21,
// loot-bag/bag-deliver.ts): «Добыча» больше не безграничный склад предметов.
import { nanoid } from "nanoid";
import { exactQty } from "@/lib/warehouseCells";
import { parseRewardConfig } from "../raid-shared";
import { fillerRef, isExtraFiller } from "../reward-filler";
import { queueEncounterReward } from "./reward-queue";
import type { EncounterTarget } from "./encounter-target";
import type { DropItem, DropRow } from "./loot-bag/bag-deliver";

/**
 * dropped — сколько из этой награды не влезло и выпало мешочком; queued — свой
 * товар ждёт в «Добыче» (мешочек не упал или товара нет в справочнике).
 */
export type GrantedReward = {
  kind: string;
  amount: number;
  packId: string | null;
  dropped?: number;
  queued?: boolean;
};

/** Выдача предметов → строки для UI: легшее и выпавшее — одной, «Добыча» — своей. */
export function grantedOf(rows: readonly DropRow[]): GrantedReward[] {
  const out: GrantedReward[] = [];
  for (const x of rows) {
    const packed = exactQty(x.toBackpack + x.dropped);
    if (packed > 0) out.push({ kind: "custom", amount: packed, packId: x.itemId, dropped: x.dropped });
    if (x.queued > 0) out.push({ kind: "custom", amount: x.queued, packId: x.itemId, queued: true });
  }
  return out;
}

/**
 * Раздаёт всё, что настроено в rewardConfig цели, и возвращает список для UI.
 * Артефакт без своей награды отдаёт сам себя — забрать его может только
 * первый добравшийся, дальше клетка помечена как опустошённая.
 */
export async function grantEncounterRewards(
  wallet: string,
  target: EncounterTarget,
  place: { mapId: string; cycleNo: number; q: number; r: number },
): Promise<GrantedReward[]> {
  const rc = parseRewardConfig(target.rewardConfig);
  const rewards: GrantedReward[] = [];
  // Происхождение (ПРАВИЛА §8.18): босс — с мобов, объект карты (сундук,
  // монетка, кучка, шахта-объект, артефакт) — «собрано прочее».
  const origin = target.kind === "boss" ? "mob" : "loot";
  // put бросает — «Добыча» не приняла; queue — то же, со сбоем в лог.
  const put: Put = async (kind, amount, packId, key) => {
    const { raidOwner } = await import("./owner");
    await queueEncounterReward({
      account: await raidOwner(wallet),
      mapId: place.mapId,
      cycleNo: place.cycleNo,
      sourceName: target.name,
      targetId: target.templateId,
      kind,
      amount,
      packId,
      origin,
      key,
    });
  };
  const queue = (kind: string, amount: number, packId: string | null) =>
    put(kind, amount, packId).catch((e) => console.warn(`[beta-encounter] ${kind} в очередь не встал:`, e));
  const items: DropItem[] = [];

  for (const f of rc.fillers) {
    if (!f.amount || f.amount <= 0) continue;
    // У награды-токена в kind лежит литерал "token", а символ монеты — в поле
    // token. Без подмены в redemptions писалось reward_token='token', ft-контракт
    // не находился и приз нельзя было вывести.
    const fillerKind = f.kind === "token" && f.token ? f.token : f.kind;
    // Ресурс и свой товар несут ССЫЛКУ (код ресурса / cst_…) в той же колонке,
    // что и пак: без неё выдача не знает, что именно зачислять. Разбор такое
    // уже отсекает, здесь — последний рубеж на случай старой записи в базе.
    const ref = fillerRef(f);
    if (isExtraFiller(f) && !ref) continue;
    // Свой товар — в рюкзак (мешочком, что не влезло): ниже, одной выдачей.
    if (fillerKind === "custom" && ref) {
      items.push({ itemId: ref, amount: f.amount, origin });
      continue;
    }
    await queue(fillerKind, f.amount, ref);
    rewards.push({ kind: fillerKind, amount: f.amount, packId: ref });
  }

  for (const p of rc.packs) {
    if (!p.packId) continue;
    await queue("pack", 1, p.packId);
    rewards.push({ kind: "pack", amount: 1, packId: p.packId });
  }

  for (const it of rc.items) {
    if (!it.itemTemplateId) continue;
    await queue("item", 1, it.itemTemplateId);
    rewards.push({ kind: "item", amount: 1, packId: it.itemTemplateId });
  }

  const empty = rc.fillers.length === 0 && rc.packs.length === 0 && rc.items.length === 0;
  if (target.kind === "artifact" && empty) {
    await queue("item", 1, target.templateId);
    rewards.push({ kind: "item", amount: 1, packId: target.templateId });
  }

  if (items.length > 0) rewards.push(...(await giveItems(wallet, target, place, items, put)));
  return rewards;
}

/** Строка «Добычи»; key — ключ строки выдачи предметов (queueKey), повтор не удвоит. */
type Put = (kind: string, amount: number, packId: string | null, key?: string) => Promise<void>;

/**
 * Предметы — в рюкзак, остаток мешочком на клетке объекта. Товара нет в
 * справочнике или мешочек точно не упал — ждёт в «Добыче». Выдача не
 * состоялась вовсе (сбой базы) — всё в «Добычу», как до мешочков: объект уже
 * опустошён, откатывать некуда.
 */
async function giveItems(
  wallet: string,
  target: EncounterTarget,
  place: { mapId: string; q: number; r: number },
  items: DropItem[],
  put: Put,
): Promise<GrantedReward[]> {
  const key = `obj:${place.mapId}:${place.q}:${place.r}:${nanoid(12)}`;
  try {
    const [{ raidOwner }, { deliverOrDrop }] = await Promise.all([
      import("./owner"),
      import("./loot-bag/bag-deliver"),
    ]);
    const res = await deliverOrDrop({
      owner: wallet,
      account: await raidOwner(wallet),
      items,
      at: {
        key,
        mapId: place.mapId,
        q: place.q,
        r: place.r,
        source: target.kind === "boss" ? "boss" : "object",
        sourceName: target.name,
      },
      toQueue: (it, k) => put("custom", it.amount, it.itemId, k),
    });
    return grantedOf(res.items);
  } catch (e) {
    console.warn("[beta-encounter] предметы — в «Добычу»:", target.templateId, e);
    return queueAll(items, put, key);
  }
}

/**
 * Всё в «Добычу» (выдача не состоялась): что встало — строками для UI. Ключи
 * строк те же, что у выдачи (queueKey): её несостоявшаяся попытка и этот путь
 * одну строку дважды не положат.
 */
export async function queueAll(
  items: readonly DropItem[],
  put: Put,
  key: string,
): Promise<GrantedReward[]> {
  const { queueKey } = await import("./loot-bag/bag-deliver");
  const out: GrantedReward[] = [];
  for (const [i, it] of items.entries()) {
    await put("custom", it.amount, it.itemId, queueKey(key, i)).then(
      () => void out.push({ kind: "custom", amount: it.amount, packId: it.itemId, queued: true }),
      (e) => console.warn("[beta-encounter] custom в очередь не встал:", e),
    );
  }
  return out;
}
