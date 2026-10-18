import { loadOwnedHero } from "./hero-load";
import { backpackHeroOf } from "./market-backpack";
import { heroPowerEnabled } from "./hero-power";
// Чтение рюкзака героя для интерфейса: состав ячеек, занято/ёмкость и «выбросить
// стек». Запись (положить/забрать/проверить место) живёт в market-backpack.ts —
// разделено ради лимита ≤250 строк.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { stackCells } from "@/lib/hero/backpackCells";
import { bagCellsOf, bagsOccupancy } from "@/lib/hero/potionBag";
import { resolveBackpack } from "./market-backpack";
import type { BackpackStack, BackpackView } from "./market-backpack";
import type { HeroRarity } from "@/lib/hero/heroSlots";
import { parseBoost } from "@/lib/hero/boost";
import { IS_POTION_SQL, POTION_JOIN } from "./potion-bag";
import { discardToBag } from "@/server/api/beta-raid/loot-bag/bag-discard";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { actionGate } from "@/server/rateGate";
import { collectedUnits } from "@/lib/magicChest";
import { collectedSql, originCols } from "@/server/api/beta-raid/stack-origin";
import { durabilityOf, toolWearOf } from "@/lib/raid/toolWear";
import { withMainTool } from "@/server/api/beta-raid/main-tool/main-tool-read";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Пустой рюкзак (героя нет): базовая редкость, ноль ячеек. */
function emptyBackpack(): BackpackView {
  return {
    heroId: null,
    heroName: null,
    spec: null,
    rarity: "rare",
    trade: 0,
    alchemy: 0,
    capacity: 0,
    occupied: 0,
    potionCapacity: 0,
    potionOccupied: 0,
    stacks: [],
  };
}

/** Занято в рюкзаке (обычные товары) и в сумке (все зелья, без обрезки). */
function occupiedOf(stacks: readonly BackpackStack[], potionCapacity: number) {
  return bagsOccupancy({ ...bagCellsOf(stacks), potionCapacity });
}

type StackRow = {
  stackKey: string;
  kind: string;
  name: string;
  image: string | null;
  count: number | string;
  /** Настройка буста шаблона своего товара (jsonb), если он буст. */
  boost: unknown;
  /** Галочка «зелье» у товара: стек лежит в сумке зелий. */
  potion: boolean;
  /** Собрано (любая метка, stack-origin) — не больше count. */
  collected: number | string | null;
  /** Галочка «магический сундук» у товара. */
  chest: boolean;
  /** Галочки «сундук» и «лопата» у товара (29.09), «удочка» (04.10), «карта» (05.10). */
  plain_chest?: boolean | null;
  shovel?: boolean | null;
  rod?: boolean | null;
  map?: boolean | null;
  /** Износ текущей штуки стопки, % (28.09, lib/raid/toolWear). */
  wear?: number | string | null;
  /** «Износ за удар, %» товара: задан — стопка инструмент с прочностью. */
  tool_wear?: number | string | null;
};

/** Прочность текущей штуки — у инструмента с износом (или уже изношенного). */
function durabilityFor(r: StackRow): number | null {
  const worn = Math.max(0, Number(r.wear) || 0);
  return toolWearOf(r.tool_wear) !== null || worn > 0 ? durabilityOf(worn) : null;
}

/** Стеки рюкзака героя по убыванию свежести. */
async function loadStacks(heroId: string, strict = false): Promise<BackpackStack[]> {
  const rows = (await mcpExec(
    // Буст тянем сразу со стеком: без него ячейка не знала бы, показывать ли
    // кнопку «Использовать», и пришлось бы спрашивать про каждый вид отдельно.
    `SELECT b.stack_key AS "stackKey", b.kind, b.name, b.image, b.count, ci.boost,
            ${IS_POTION_SQL} AS potion, ${collectedSql(originCols("b."))} AS collected,
            COALESCE(ci.magic_chest, false) AS chest, b.wear, ci.tool_wear,
            COALESCE(ci.plain_chest, false) AS plain_chest, COALESCE(ci.is_shovel, false) AS shovel,
            COALESCE(ci.is_rod, false) AS rod, COALESCE(ci.is_map, false) AS map
       FROM yuplink.raid_hero_backpack b
       ${POTION_JOIN}
      WHERE b.hero_id = ${sqlStr(heroId)} AND b.count > 0
      ORDER BY b.updated_at DESC, b.stack_key;`,
    { wrapJson: true },
  ).catch((error) => {
    if (strict) throw error;
    return [];
  })) as StackRow[];
  return (rows ?? []).map((r) => {
    const count = num(r.count);
    return {
      stackKey: r.stackKey,
      kind: r.kind,
      name: r.name,
      image: r.image ?? null,
      count,
      cells: stackCells(count),
      boost: parseBoost(r.boost),
      potion: r.potion === true,
      collected: collectedUnits(count, num(r.collected)),
      chest: r.chest === true,
      plainChest: r.plain_chest === true,
      shovel: r.shovel === true,
      rod: r.rod === true,
      map: r.map === true,
      durability: durabilityFor(r),
    };
  });
}

/** Рюкзак выбранного героя для UI: ячейки, содержимое, занято/ёмкость. */
export const getMyBackpack = createServerFn({ method: "GET" }).handler(
  async (): Promise<BackpackView> => {
    const wallet = requireWallet();
    const bp = await resolveBackpack(wallet).catch(() => null);
    if (!bp) return emptyBackpack();
    const stacks = await loadStacks(bp.heroId);
    const tools = await withMainTool(bp.heroId, stacks);
    return {
      heroId: bp.heroId,
      heroName: bp.heroName,
      spec: bp.spec,
      rarity: bp.rarity,
      trade: bp.trade,
      alchemy: bp.alchemy,
      capacity: bp.capacity,
      potionCapacity: bp.potionCapacity,
      ...occupiedOf(stacks, bp.potionCapacity),
      stacks: tools.stacks,
      mainTool: tools.mainTool,
    };
  },
);

/** Ownership is checked before looking up a backpack by hero_id. */
export const getOwnedHeroBackpack = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ heroId: z.string().trim().min(1) }).parse(d))
  .handler(async ({ data }): Promise<BackpackView> => {
    const wallet = requireWallet();
    if (!(await heroPowerEnabled(wallet))) throw new Error("Hero backpack unavailable");
    // Баффы живут на аккаунте — как и в окне героя (getOwnedHeroGear).
    const { loadBuffsFor } = await import("./hero-buff");
    const [hero, buffs] = await Promise.all([
      loadOwnedHero(wallet, data.heroId),
      loadBuffsFor(wallet),
    ]);
    const bp = backpackHeroOf(hero, buffs);
    const stacks = await loadStacks(hero.heroId, true);
    const tools = await withMainTool(hero.heroId, stacks);
    return { ...bp, ...occupiedOf(stacks, bp.potionCapacity), ...tools };
  });

/**
 * Выбросить из рюкзака — в мешочек на клетке героя (дополнение №4 владельца,
 * 29.09.2026; loot-bag/bag-discard.ts): выброшенное не пропадает.
 *
 * `qty` — сколько ШТУК выкинуть. Без него улетал весь стек: у железа на две
 * ячейки игрок нажимал «выбросить», рассчитывая освободить одну, и терял всё.
 * Столько же, сколько лежит (или больше) — стопка целиком; дробь — как есть,
 * без округления (правило — backpack-discard.ts). `op` — ключ нажатия: повтор
 * того же нажатия второй раз не выбрасывает.
 */
export const discardBackpackStack = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        stackKey: z.string().min(1).max(200),
        qty: z.number().positive().max(1_000_000).optional(),
        op: z
          .string()
          .regex(/^[A-Za-z0-9_-]{6,64}$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    // Выброс кладёт мешочек на карту рейда: гейт рейда и частота, как у ручек мешочка.
    const wallet = await requireBetaRaid();
    await actionGate("bag-discard", wallet);
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const res = await discardToBag({
      wallet,
      heroId: bp.heroId,
      stackKey: data.stackKey,
      qty: data.qty,
      clientOp: data.op,
    });
    return { ok: true as const, ...res };
  });
