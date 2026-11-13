// Рынок героев: выставить одного или нескольких героев (ПРАВИЛА §8.67).
//
// Каждый герой — отдельный вызов hero_market_list (своя транзакция): отказ одного
// не трогает остальных, ответ — итог по каждому (кто выставлен, кто нет и почему).
// Интерфейс показывает «выставлен» только по этому ответу.
//
// Ключ нажатия (op) приходит с клиента; у каждого героя пачки свой ключ
// «hm:<аккаунт>:<op>:<копия>» — повтор того же нажатия (обрыв сети, второй тап)
// отвечает тем же лотом и второй раз ничего не делает. Отменённое подтверждение до
// сервера не доходит — ничего не меняется.
//
// Карманы выставленного (рюкзак + сумка зелий) переезжают основному герою —
// сколько влезет (hm-pockets-plan); не влезшее падает мешочком на клетку игрока,
// начатая штука инструмента без места сгорает (как «Выбросить»), гриб без места
// встаёт на карту сам. Основного нет — всё мешочком (гриб — отказ dmine_no_main).
// Не влезает что-то — нужно согласие ЭТОГО героя на ЭТОТ список: acceptKey героя
// = dropsKey раскладки. Нет или устарел — отказ heromkt.pockets_overflow со
// списком (toMain / drops) и новым dropsKey, ничего не тронуто: окно, согласие —
// тот же запрос с acceptKey у героя. Пачка идёт по очереди: место основного,
// занятое героем раньше, следующий уже не получит (и согласия на это не давал).
import { z } from "zod";
import { HERO_MARKET_BATCH_MAX, heroMarketPriceFormIssue } from "@/lib/heroMarket";
import {
  dbErrorText,
  OP_RE,
  opKey,
  paramsOf,
  type HmResult,
} from "@/server/api/hero-market/hm-call";
import {
  dropsOf,
  movesOf,
  type PocketDrop,
  type PocketLine,
  type PocketMove,
} from "@/server/api/hero-market/hm-pockets-plan";
import { linesOfMoves, listOne, type ListCtx } from "@/server/api/hero-market/hm-list-one";
import {
  afterDrops,
  bagOf,
  plantNow,
  pocketsOf,
  type Drop,
  type PocketStack,
} from "@/server/api/hero-market/hm-list-after";

export type { PocketStack } from "@/server/api/hero-market/hm-list-after";
export type { PocketDrop, PocketMove } from "@/server/api/hero-market/hm-pockets-plan";

export const listInputSchema = z.object({
  op: z.string().regex(OP_RE),
  heroes: z
    .array(
      z.object({
        itemId: z.string().trim().min(1).max(80),
        priceGold: z.number().nullable().optional(),
        priceDarai: z.number().nullable().optional(),
        /** Согласие на окно «выпадет»: dropsKey этого героя из превью или прошлого отказа. */
        acceptKey: z.string().max(64).optional(),
      }),
    )
    .min(1)
    .max(HERO_MARKET_BATCH_MAX),
});
export type ListInput = z.infer<typeof listInputSchema>;

/** Итог по одному герою пачки. */
export type HeroListResult =
  | {
      itemId: string;
      ok: true;
      lotId: string;
      /** false — это повтор уже выставленного тем же нажатием. */
      fresh: boolean;
      /** Куда упало не влезшее; null — всё уехало основному (или карманы были пусты). */
      bag: { id: string; mapId: string; q: number; r: number } | null;
      /** Что легло в мешочек. */
      pockets: PocketStack[];
      /** Что уехало в рюкзак основного героя. */
      toMain: PocketMove[];
      /** Что не влезло: мешочек / сгорело / гриб встал на карту. */
      drops: PocketDrop[];
    }
  | {
      itemId: string;
      ok: false;
      error: string;
      params?: Record<string, string | number>;
      /** pockets_overflow / no_position: что уйдёт основному и что выпадет. */
      toMain?: PocketMove[];
      drops?: PocketDrop[];
      /** Ключ согласия на эти drops: окно → тот же запрос с acceptKey = dropsKey у героя. */
      dropsKey?: string;
    };

/** Отказы, к которым окну нужен список «что куда». */
const WITH_LIST = new Set(["pockets_overflow", "no_position"]);

function toResult(itemId: string, r: HmResult, lines: PocketLine[], key: string): HeroListResult {
  if (!r.ok) {
    const params = paramsOf(r);
    const list = WITH_LIST.has(String(r.error)) && lines.length > 0;
    return {
      itemId,
      ok: false,
      error: `heromkt.${r.error ?? "failed"}`,
      ...(Object.keys(params).length ? { params } : {}),
      ...(list ? { toMain: movesOf(lines), drops: dropsOf(lines), dropsKey: key } : {}),
    };
  }
  const bag = bagOf(r.bag);
  const done = linesOfMoves(r.moves);
  return {
    itemId,
    ok: true,
    lotId: String(r.lotId),
    fresh: r.fresh !== false,
    bag: bag ? { id: bag.id, mapId: bag.mapId, q: bag.q, r: bag.r } : null,
    pockets: pocketsOf(r.pockets),
    toMain: movesOf(done),
    drops: dropsOf(done),
  };
}

/**
 * Выставить героев аккаунта. Формат и потолки цены — до базы (по каждому герою);
 * редкость, минимумы, занятость и карманы — в функции базы под замком героя.
 */
export async function listHeroesAs(
  wallet: string,
  account: string,
  input: ListInput,
): Promise<{ results: HeroListResult[]; listed: number }> {
  const seen = new Set<string>();
  const results: HeroListResult[] = [];
  const drops: Drop[] = [];
  const ctx: ListCtx = {};
  for (const h of input.heroes) {
    const itemId = h.itemId;
    if (seen.has(itemId)) {
      results.push({ itemId, ok: false, error: "heromkt.duplicate" });
      continue;
    }
    seen.add(itemId);
    const priceGold = h.priceGold ?? null;
    const priceDarai = h.priceDarai ?? null;
    // Редкость и курс здесь неизвестны — только форма цены; минимумы считает база.
    const issue = heroMarketPriceFormIssue(priceGold, priceDarai);
    if (issue) {
      results.push({
        itemId,
        ok: false,
        error: issue.error,
        ...(issue.params ? { params: issue.params } : {}),
      });
      continue;
    }
    try {
      const op = opKey(account, input.op, itemId);
      const one = { op, account, wallet, itemId, priceGold, priceDarai, acceptKey: h.acceptKey };
      const { r, lines, key } = await listOne(one, ctx);
      results.push(toResult(itemId, r, lines, key));
      if (r.ok && r.fresh !== false) {
        drops.push({ bag: bagOf(r.bag), pockets: pocketsOf(r.pockets), ref: op });
        await plantNow(wallet, account, r);
      }
    } catch (e) {
      console.warn(
        `[hero-market] выставление ${itemId} не прошло:`,
        e instanceof Error ? e.message : e,
      );
      const text = dbErrorText(e);
      const bar = text.indexOf("|");
      results.push({ itemId, ok: false, error: bar > 0 ? text.slice(0, bar) : text });
    }
  }
  afterDrops(wallet, account, drops);
  return { results, listed: results.filter((r) => r.ok).length };
}
