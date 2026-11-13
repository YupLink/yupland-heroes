// Ломбард героев: снять героя у игрока за выплату скупки «Любой … герой» и
// вернуть его, если сделка сорвалась. SQL — в hero-pawn-sql.ts.
//
// Игрок сдаёт КОНКРЕТНЫЕ копии (pick.heroItemIds): у копий одного шаблона разные
// уровни, и «сервер возьмёт какую-нибудь» отдал бы за золото прокачанного героя
// вместо пустого. С 23.10.2026 (владелец: «дать возможность сразу несколько
// выбирать в редкости») копий в сделке может быть несколько — каждая снимается
// своим оператором со своим снимком, и сделка «всё или ничего»: сорвалась одна —
// уже снятые возвращаются. Старый клиент из кэша шлёт одну (pick.heroItemId).
//
// Порядок проекта прежний — сначала товар у игрока, потом выплата (market-sell),
// сбой выплаты — возврат тем же ключом. Здесь обе половины: снятие со снимком
// и возврат из снимка. Слепой повтор моста не снимает второго героя (копия уже
// удалена) и получает тот же ответ из снимка.
import { mcpExec } from "../../db/mcpClient";
import { sqlRow } from "./chest/chest-row";
import { heroAnyRarity, type HeroRarity, type PawnHeroRef } from "./hero-any";
import {
  heroStateSql,
  listFreeHeroesSql,
  markPaidSql,
  recallTakeSql,
  restoreHeroSql,
  takeHeroSql,
  wokenAfterSql,
} from "./hero-pawn-sql";
import { reportUndoFailure } from "./market-undo-alert";
import type { SpendPick, SpendReceipt } from "./market-money";

/** Копия героя в пикере «кого сдать». */
export type SellableHero = {
  itemId: string;
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: HeroRarity;
  level: number;
};

/** Свободные герои редкости. Сбой базы летит наверх: пустота — это ответ «сдавать некого». */
export async function listFreeHeroes(account: string, rarity: HeroRarity): Promise<SellableHero[]> {
  const rows = (await mcpExec(listFreeHeroesSql(account, rarity), {
    wrapJson: true,
  })) as SellableHero[];
  return (rows ?? []).map((r) => ({ ...r, level: Math.max(0, Math.floor(Number(r.level) || 0)) }));
}

type Took = { itemId: string; templateId: string };

/** Отказ по существу: не твой, уникальный, другая редкость или занят. */
async function whyNot(account: string, itemId: string, rarity: HeroRarity): Promise<never> {
  const rows = (await mcpExec(heroStateSql(account, itemId), { wrapJson: true })) as Array<{
    rarity: string;
    unique: boolean;
    free: boolean;
  }>;
  const row = rows?.[0];
  if (!row) throw new Error("market.hero_none");
  if (row.unique) throw new Error("market.hero_unique");
  if (row.rarity !== rarity) throw new Error("market.hero_rarity_wrong");
  throw new Error("market.hero_busy");
}

/**
 * Выбранные копии: новый клиент шлёт список, старый из кэша — одну. Дубли
 * схлопнуты — одну копию дважды не посчитать, и [a, a] за двоих не пройдёт.
 */
export function pickedHeroIds(pick?: SpendPick): string[] {
  const raw = pick?.heroItemIds?.length ? pick.heroItemIds : [pick?.heroItemId ?? ""];
  return [...new Set(raw.map((id) => id.trim()).filter(Boolean))];
}

/**
 * Снять одну копию. op — ключ её снимка: у одиночной сделки это сам ref (как
 * было), у пачки — ref с id копии, иначе вторая копия упёрлась бы в снимок первой.
 */
async function takeOne(
  wallet: string,
  account: string,
  token: string,
  rarity: HeroRarity,
  itemId: string,
  op: string,
): Promise<PawnHeroRef> {
  const took = sqlRow<Took>(
    (await mcpExec(takeHeroSql({ account, itemId, rarity, op }))) as unknown[],
  );
  let got: Took | null = took?.itemId ? took : null;
  if (!got) {
    // Ничего не сняли: либо нечего, либо это повтор удачной попытки — снимок
    // и есть прошлый ответ.
    const before = (await mcpExec(recallTakeSql(op), { wrapJson: true })) as Took[];
    got = before?.[0]?.itemId ? before[0] : null;
    if (!got) return whyNot(account, itemId, rarity);
  }
  const ref: PawnHeroRef = { op, ...got };

  // Спящего героя могли разбудить в тот же миг (экземпляр появился после
  // нашего снимка): такой уже не свободен — возвращаем копию и отказываем.
  // Пробуждение и первая прокачка ждут замка копии (hero-item-lock), так что
  // это страховка от путей мимо замка. Провал возврата — алерт, как у прочих.
  const woken = (await mcpExec(wokenAfterSql(got.itemId), { wrapJson: true })) as unknown[];
  if ((woken?.length ?? 0) > 0) {
    const undoRef = `${op}:woken`;
    await restorePawnHeroes([ref], 1).catch((e) =>
      reportUndoFailure(
        { wallet, account, side: "sell", res: "hero", token, amount: 1, spendRef: op, undoRef },
        e,
      ),
    );
    throw new Error("market.hero_busy");
  }
  return ref;
}

/**
 * Оплата «Любым героем редкости X»: снять выбранные копии. Квитанция несёт
 * ключи снимков — по ним откат вернёт героев целиком (restorePawnHeroes).
 */
export async function spendPawnHero(
  wallet: string,
  account: string,
  token: string,
  amount: number,
  ref: string,
  pick?: SpendPick,
): Promise<SpendReceipt> {
  const rarity = heroAnyRarity(token);
  if (!rarity) throw new Error("market.not_enough");
  const ids = pickedHeroIds(pick);
  if (!ids.length) throw new Error("market.hero_pick_need");
  // Сколько героев в сделке — столько и выбрано, копия к копии: число с клиента
  // без своего списка копий не пройдёт.
  if (amount !== ids.length) throw new Error("market.bad_qty");

  const paid: PawnHeroRef[] = [];
  // Копия, которая снимается сейчас: снятие могло пройти в базе, а ответ —
  // потеряться (сбой связи после коммита). Возврат по ключу без снимка — пустой.
  let cur: PawnHeroRef | null = null;
  try {
    for (const itemId of ids) {
      cur = { op: ids.length === 1 ? ref : `${ref}:${itemId}`, itemId, templateId: "" };
      paid.push(await takeOne(wallet, account, token, rarity, itemId, cur.op));
      cur = null;
    }
  } catch (e) {
    // Сорвалась копия посередине — сделки нет: уже снятые возвращаем из снимков,
    // текущую — если упало не отказом по существу (market.*: её не сняли или уже
    // вернули сами). Провал возврата — алерт с ключом сделки, игроку — причина отказа.
    const refused = e instanceof Error && e.message.startsWith("market.");
    const back = cur && !refused ? [...paid, cur] : paid;
    if (back.length)
      await restorePawnHeroes(back, back.length).catch((err) =>
        reportUndoFailure(
          {
            wallet,
            account,
            side: "sell",
            res: "hero",
            token,
            amount: back.length,
            spendRef: ref,
            undoRef: `${ref}:partial`,
          },
          err,
        ),
      );
    throw e;
  }
  return { paidHeroes: paid };
}

/** Выплата за сданных прошла: снимки закрыты (paid_at) — откат их больше не вернёт. */
export async function markPawnHeroesPaid(heroes: PawnHeroRef[]): Promise<void> {
  const ops = [...new Set(heroes.map((h) => h.op))];
  if (ops.length) await mcpExec(markPaidSql(ops));
}

/**
 * Вернуть сданных героев из снимков — откат сделки. amount — сколько штук
 * возвращать (частичный откат выплаты паками); герой штучный, дробь — вниз.
 */
export async function restorePawnHeroes(heroes: PawnHeroRef[], amount: number): Promise<void> {
  const n = Math.min(heroes.length, Math.max(0, Math.floor(amount)));
  for (const h of heroes.slice(0, n)) await mcpExec(restoreHeroSql(h.op));
}
