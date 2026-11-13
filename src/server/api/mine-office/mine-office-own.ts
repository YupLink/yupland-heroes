// «Управление шахтами» (владелец, 25.10.2026): здание замка. Покупается в
// Ратуше, как Храм (castle_building kind 'mine_office', townhall-buy.ts:
// списание до постройки одной функцией базы, повтор не задваивает). Есть
// здание — в замке иконка, из которой свои шахты чинят, переключают
// (mine-office-act.ts) и собирают (mine-office-claim.ts) удалённо; нет — к
// каждой шахте ходят отдельно.
import { createServerFn } from "@tanstack/react-start";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import { hasCastleBuilding } from "@/server/api/castle-townhall/free-build";
import { actionGate } from "@/server/rateGate";
import { requireAtCastle } from "@/server/api/beta-raid/castle";
import { MINE_OFFICE_KIND } from "@/lib/townHallCatalog";

/** Кошелёк и аккаунт — тот же, что владеет шахтами (raid_mine_state). */
export async function officeWho(): Promise<{ wallet: string; account: string }> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return { wallet, account };
}

/** Построено ли здание у аккаунта. */
export async function hasMineOffice(account: string): Promise<boolean> {
  // Купленное здание или личное право «строить бесплатно» (free-build.ts).
  return hasCastleBuilding(account, MINE_OFFICE_KIND);
}

export async function requireMineOffice(account: string): Promise<void> {
  if (!(await hasMineOffice(account))) throw new Error("mineoffice.not_built");
}

/**
 * Перед любым действием окна: здание, затем замок (без здания «дойди до
 * замка» звучало бы обещанием).
 */
export async function officeGate(what: string): Promise<{ wallet: string; account: string }> {
  const me = await officeWho();
  await actionGate(what, me.wallet);
  await requireMineOffice(me.account);
  await requireAtCastle(me.wallet);
  return me;
}

/** Есть ли здание — для иконки и облика на площади замка. */
export const getMineOffice = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ owned: boolean }> => {
    const { account } = await officeWho();
    return { owned: await hasMineOffice(account) };
  },
);
