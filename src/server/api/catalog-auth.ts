// Правка общих справочников (владелец, 04.11.2026: «да, давай справочники без
// денег»). Админ — как было. Право catalogs (admin-rights) — шаблоны объектов и
// боссов, свои товары, категории, рыбалка, находки лопатой, метки, облики,
// чертежи городов, но без денег:
//  · присланное чистится от токенов (god-money.stripMoney);
//  · шаблон, где деньги уже есть, правит и удаляет только админ;
//  · удалить можно только то, чего нет ни на картах, ни у игроков.
import { getCurrentWallet, isAdminWallet } from "@/server/auth";
import { walletHasRight } from "@/server/admin-rights";
import { stripMoney } from "@/server/api/beta-raid/god-money";

export type CatalogActor = { wallet: string; money: boolean };

export async function requireCatalogEditor(): Promise<CatalogActor> {
  const wallet = getCurrentWallet();
  if (wallet && isAdminWallet(wallet)) return { wallet, money: true };
  if (wallet && (await walletHasRight(wallet, "catalogs"))) return { wallet, money: false };
  throw new Error("Нет доступа");
}

/** Есть ли в значении деньги (токены, USDT, DARAI). */
export const hasMoney = (v: unknown): boolean =>
  v != null && JSON.stringify(stripMoney(v)) !== JSON.stringify(v);

/** Не админ — шаблон с деньгами не трогает. */
export function assertNoMoneyIn(actor: CatalogActor, existing: unknown): void {
  if (!actor.money && hasMoney(existing))
    throw new Error("В шаблоне есть деньги — правит только админ");
}

/** Не админ — присланное без денег. */
export const withoutMoney = <T>(actor: CatalogActor, v: T): T =>
  actor.money || v == null ? v : (stripMoney(v) as T);

const one = async (sql: string): Promise<Record<string, unknown> | null> => {
  const { mcpExec } = await import("@/server/db/mcpClient");
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<Record<string, unknown>>;
  return rows?.[0] ?? null;
};

/** Не админ правит шаблон предмета (meta) — только если в нём нет денег. */
export async function assertItemTemplateFree(actor: CatalogActor, id: string): Promise<void> {
  if (actor.money) return;
  const { sqlStr } = await import("@/server/api/raid-shared");
  const row = await one(`SELECT meta FROM yuplink.mystic_item_template WHERE id = ${sqlStr(id)};`);
  assertNoMoneyIn(actor, row?.meta ?? null);
}

/** Не админ удаляет шаблон предмета — только без денег и если его нет у игроков. */
export async function assertItemTemplateDeletable(actor: CatalogActor, id: string): Promise<void> {
  if (actor.money) return;
  await assertItemTemplateFree(actor, id);
  const { sqlStr } = await import("@/server/api/raid-shared");
  const owned = await one(
    `SELECT 1 AS ok FROM yuplink.user_game_item WHERE template_id = ${sqlStr(id)} LIMIT 1;`,
  );
  if (owned) throw new Error("Шаблон есть у игроков — удаляет только админ");
}

/** Не админ правит шаблон босса — только если в его наградах нет денег. */
export async function assertBossTemplateFree(actor: CatalogActor, id: string): Promise<void> {
  if (actor.money) return;
  const { sqlStr } = await import("@/server/api/raid-shared");
  const row = await one(
    `SELECT reward_tiers FROM yuplink.raid_boss_template WHERE id = ${sqlStr(id)};`,
  );
  assertNoMoneyIn(actor, row?.reward_tiers ?? null);
}
