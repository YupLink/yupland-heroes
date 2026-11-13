// Кого игрок может сдать в ломбард по позиции «Любой … герой» — список для пикера.
//
// Каждая копия отдельно: у копий одного шаблона разные уровни, и выбирает
// игрок, а не сервер. Занятых (основной, на грядке, отдыхает, рыбачит, с
// грибом DARAI в рюкзаке) в списке нет — продажа их всё равно не пропустит
// (hero-pawn-sql.pawnFreeSql). Прочие вещи рюкзака продаже не мешают — после
// оплаты они падают мешочком на клетку основного героя (hero-pawn-drop).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { accAccountId } from "../currency/move";
import { listFreeHeroes, type SellableHero } from "./hero-pawn-take";

const input = (d: unknown) =>
  z.object({ rarity: z.enum(["common", "rare", "epic", "legendary"]) }).parse(d);

/** Свободные герои игрока этой редкости. Нет аккаунта — пусто. */
export const listSellableHeroes = createServerFn({ method: "GET" })
  .inputValidator(input)
  .handler(async ({ data }): Promise<SellableHero[]> => {
    const wallet = await requireBetaRaid();
    const account = await accAccountId(wallet);
    if (!account) return [];
    return listFreeHeroes(account, data.rarity);
  });
