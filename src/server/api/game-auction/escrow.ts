// Залог лота игрока: вещь уходит из рук при выставлении и возвращается, если лот
// не продан, снят или не вышел в торги. Каждое движение — по ключу лота
// «gauclot:<id>», поэтому повтор (ретрай моста, второе нажатие, сторож) ничего
// не удвоит:
//   ресурс   — res_move, виды auction_escrow / auction_return;
//   артефакт — takeArtifacts / restoreArtifacts: вернутся те же экземпляры (по
//              памятке в raid_backpack_op); надетые не берутся;
//   товар    — takeItemOnce / returnItemOnce из рюкзака того героя, у кого взяли
//              (с метками происхождения — собранное останется собранным).
// Возврат смотрит на улики (строка журнала / памятка / ключ списания): что не
// брали, то и не вернём.
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { restoreArtifacts, takeArtifacts } from "../beta-raid/art-stock";
import { recallTaken } from "../beta-raid/art-memo";
import { returnItemOnce, takeItemOnce } from "../beta-raid/pay-once-item";
import { payOp } from "../beta-raid/pay-once";
import type { BackpackTakeSnapshot } from "../beta-raid/market-backpack-take";

export type EscrowInfo = {
  heroId?: string;
  stackKey?: string;
  image?: string | null;
  snap?: BackpackTakeSnapshot;
};

export type EscrowLot = {
  id: string;
  title: string | null;
  prize_kind: string;
  prize_ref: string;
  prize_qty: number | string;
  seller_account_id: string;
  seller_wallet: string;
  escrow: EscrowInfo | null;
};

const lotKey = (id: string): string => `gauclot:${id}`;
const artMemo = (id: string): string => `art:${lotKey(id)}#`;

async function exists(sql: string): Promise<boolean> {
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ n: number | string }>;
  return Number(rows?.[0]?.n) > 0;
}

/** Взять вещь в залог. ok=false — столько нет (ничего не взято). */
export async function takeEscrow(
  lot: EscrowLot,
): Promise<{ ok: boolean; snap?: BackpackTakeSnapshot }> {
  const key = lotKey(lot.id);
  const qty = Number(lot.prize_qty);
  if (lot.prize_kind === "resource") {
    const { error } = await sb.rpc("res_move", {
      p_account: lot.seller_account_id,
      p_resource: lot.prize_ref,
      p_delta: -qty,
      p_kind: "auction_escrow",
      p_ref: key,
    });
    if (!error) return { ok: true };
    if (/в минус/.test(String(error.message))) return { ok: false };
    throw new Error(error.message);
  }
  if (lot.prize_kind === "artifact") {
    const taken = await takeArtifacts({
      account: lot.seller_account_id,
      wallet: lot.seller_wallet,
      qty,
      pick: { templateId: lot.prize_ref },
      op: key,
    });
    return { ok: !!taken };
  }
  const { heroId, stackKey } = lot.escrow ?? {};
  if (!heroId || !stackKey) throw new Error("Аукцион: у лота нет рюкзака продавца");
  const snap = await takeItemOnce(heroId, stackKey, qty, key);
  return snap ? { ok: true, snap } : { ok: false };
}

/** Вернуть залог продавцу. Идемпотентно; сбой базы летит наверх (повторит сторож). */
export async function returnEscrow(lot: EscrowLot): Promise<void> {
  const key = lotKey(lot.id);
  const qty = Number(lot.prize_qty);

  if (lot.prize_kind === "resource") {
    const taken = await exists(
      `SELECT count(*) AS n FROM yuplink.res_ledger
        WHERE kind = 'auction_escrow' AND ref = ${sqlStr(key)};`,
    );
    if (!taken) return;
    const { error } = await sb.rpc("res_move", {
      p_account: lot.seller_account_id,
      p_resource: lot.prize_ref,
      p_delta: qty,
      p_kind: "auction_return",
      p_ref: `${key}:back`,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (lot.prize_kind === "artifact") {
    const memo = (await mcpExec(
      `SELECT count(*) AS n FROM yuplink.raid_backpack_op
        WHERE op LIKE ${sqlStr(`${artMemo(lot.id).replace(/[\\%_]/g, "\\$&")}%`)} ESCAPE '\\';`,
      { wrapJson: true },
    )) as Array<{ n: number | string }>;
    const want = Number(memo?.[0]?.n) || 0;
    if (want === 0) return;
    const arts = await recallTaken(artMemo(lot.id));
    // Памятка есть, а прочитать её не вышло — не отмечаем «вернули» вслепую.
    if (arts.length < want) throw new Error("Аукцион: памятка артефактов не прочиталась");
    await restoreArtifacts({ wallet: lot.seller_wallet, account: lot.seller_account_id, arts });
    return;
  }

  const taken = await exists(
    `SELECT count(*) AS n FROM yuplink.raid_backpack_op WHERE op = ${sqlStr(payOp(key))};`,
  );
  if (!taken) return;
  const { heroId, stackKey, snap, image } = lot.escrow ?? {};
  if (!heroId || !stackKey) throw new Error("Аукцион: у лота нет рюкзака продавца");
  // Снимка нет только после обрыва между взятием и выходом в торги — тогда
  // ячейку заводим по самому товару, без меток.
  const fallback: BackpackTakeSnapshot = {
    kind: "custom",
    refId: lot.prize_ref,
    name: lot.title || lot.prize_ref,
    image: image ?? null,
    mobTaken: 0,
  };
  await returnItemOnce(heroId, stackKey, qty, snap ?? fallback, lot.seller_account_id, key);
}
