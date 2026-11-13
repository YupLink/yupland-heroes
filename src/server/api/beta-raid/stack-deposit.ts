// Стопка «по ссылке» — в рюкзак ВЫБРАННОГО героя: свой товар (cst_…) или
// босс (стопка boss:<шаблон>, как охрана из лавки и подарок-босс).
//
// Без отдельной предпроверки места: depositToBackpack решает «влезет ли» и
// пишет ОДНИМ шагом под локом героя, а повтор того же ключа (nonce) отвечает
// «уже положено» даже в полном рюкзаке. Предпроверка снаружи ломала бы именно
// повтор: положенная в первый раз стопка сама занимала место, и второй заход
// читал «не влезает» поверх выданного.
//
// Отказы — те же «бытовые» ключи, что у наград (SOFT_GRANT_ERRORS):
// market.need_hero, market.backpack_need:N:M, raid.reward_bad_ref.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { BAD_REF } from "@/server/api/raid-reward-extra";
import { canonCustomMeta, type StackItem } from "@/server/api/beta-raid/item-alias";
import type { StackOrigin } from "@/server/api/beta-raid/stack-origin";

type DepositItem = StackItem & { image: string | null };

/** Товар или босс по ссылке; в справочнике нет — null. */
export async function stackItemOf(
  kind: "custom" | "boss",
  ref: string,
): Promise<DepositItem | null> {
  if (kind === "custom") {
    const meta = await canonCustomMeta(ref);
    if (!meta) return null;
    return { id: ref, kind: "custom", refId: ref, name: meta.name || ref, image: meta.image };
  }
  // Сбой чтения летит наверх: «шаблона нет» и «не смогли спросить» — разное.
  const rows = (await mcpExec(
    `SELECT name, image_url AS image FROM yuplink.raid_boss_template
      WHERE id = ${sqlStr(ref)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string | null; image: string | null }>;
  const row = rows?.[0];
  if (!row) return null;
  return {
    id: `boss:${ref}`,
    kind: "boss",
    refId: ref,
    name: String(row.name ?? "").trim() || ref,
    image: row.image ?? null,
  };
}

/**
 * Ключ выдачи уже занят (depositToBackpack пишет его как 'bp:' || nonce вместе
 * со стопкой): эта стопка уже лежит в рюкзаке. Сбой чтения летит наверх —
 * «не знаем» не равно «не клали».
 */
export async function stackAlreadyGiven(nonce: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT EXISTS(SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${sqlStr(`bp:${nonce}`)}) AS was;`,
    { wrapJson: true },
  )) as Array<{ was?: boolean }>;
  return rows?.[0]?.was === true;
}

/**
 * Положить стопку. Ответ: "given" — положили сейчас, "already" — этим ключом
 * уже клали (повтор). Ключ проверяем ПЕРВЫМ, до героя и справочника: повтор
 * после смены героя или удалённого шаблона иначе прочитал бы «некуда/нечего»
 * и отправил в «Добычу» копию уже выданного.
 */
export async function depositRefStack(o: {
  wallet: string;
  account: string;
  kind: "custom" | "boss";
  ref: string | null;
  qty: number;
  /** Ключ выдачи: стабилен между повторами, уникален на строку. */
  nonce: string;
  origin?: StackOrigin | null;
}): Promise<"given" | "already"> {
  if (await stackAlreadyGiven(o.nonce)) return "already";
  const ref = (o.ref ?? "").trim();
  const qty = Math.max(0, Math.floor(Number(o.qty) || 0));
  if (!ref || qty <= 0) throw new Error(BAD_REF);
  if (o.kind === "custom" && !ref.startsWith("cst_")) throw new Error(BAD_REF);
  const item = await stackItemOf(o.kind, ref);
  if (!item) throw new Error(BAD_REF);
  const { resolveBackpack, depositToBackpack } = await import("./market-backpack");
  const bp = await resolveBackpack(o.wallet);
  if (!bp) throw new Error("market.need_hero");
  await depositToBackpack({
    heroId: bp.heroId,
    account: o.account,
    item,
    qty,
    nonce: o.nonce,
    capacity: bp.capacity,
    potionCapacity: bp.potionCapacity,
    origin: o.origin ?? null,
  });
  return "given";
}
