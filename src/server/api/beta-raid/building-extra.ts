// Что достроенная постройка предлагает сверх смены облика.
//
// Верфь спускает корабли, обзорная вышка открывает местность вокруг. Окно
// постройки одно на всех, поэтому лишние действия приходят отдельным блоком:
// какое действие, чем платить и почему сейчас нельзя.
import { raidOwner } from "./owner";
import { buildingUsed } from "./building-used";
import { mineExtra } from "./mine-extra";
import { treeExtra } from "./tree-extra";
import { freeWaterAround } from "./ships";
import { canIgnoreVoid } from "./voidGate";
import { marketExtra } from "./market-extra";
import {
  signText,
  TOWER_ENERGY,
  TOWER_RADIUS,
  shipPriceFor,
  type BuildingEffect,
  type BuildingExtra,
} from "@/lib/buildingEffect";
import {
  SHIPYARD_TIER_SMALL,
  SHIPYARD_TIER_BIG,
  BIG_SHIP_WOOD,
  BIG_SHIP_ITEM_NAME,
} from "@/lib/shipRules";
import type { CurrentHero } from "./hero-current";
import { getSessionTgId } from "../../auth";
import { isGoogleOnlyTg } from "@/lib/auth/googleTg";
import { buckwheatOpenForSession as buckwheatOpen } from "../buckwheat/bwAccess";

// Вынесено в свой модуль, ре-экспорт — старые импорты отсюда не меняются.
export { buildingUsed } from "./building-used";

export async function buildingExtra(opts: {
  effect: BuildingEffect;
  built: boolean;
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  hero: CurrentHero | null;
  /** Тир клетки: таверне важен не «достроена», а какой именно тир стоит. */
  tier?: number;
  /** meta шаблона и настройки клетки — у дерева там лежат цены. */
  meta?: unknown;
  cellConfig?: unknown;
}): Promise<BuildingExtra> {
  const { effect, built, wallet, mapId, q, r, hero } = opts;
  if (!effect) return null;

  if (effect === "leveltree") return treeExtra(opts);

  // Алтарь-буст: постоянная прибавка к характеристике за плату.
  if (effect === "boost") return (await import("./boost-extra")).boostExtra(opts);

  // Столб заклинаний и «Забвение»: цена и «настроен ли вообще». Витрина
  // столба — отдельной ручкой, когда игрок откроет окно столба.
  if (effect === "spellbook") {
    const { spellPillarExtra } = await import("./spell-pillar-extra");
    return spellPillarExtra({ built, meta: opts.meta, cellConfig: opts.cellConfig });
  }
  if (effect === "oblivion") return (await import("./oblivion-extra")).oblivionExtra(opts);
  if (effect === "art_gen") return (await import("../art-gen/art-gen-extra")).artGenExtra(opts);

  // Табличка ничего не стоит и ничего не требует: подошёл — прочитал.
  if (effect === "sign") return { kind: "sign", text: signText(opts.cellConfig) };

  // Таверна меняет основного героя за лайки. Цену задаёт админ одной настройкой
  // на весь мир, а число смен в сутки — тир: второй даёт одну, третий две.
  if (effect === "tavern") {
    const { heroSwapPrice, walletList } = await import("./tavern");
    const { tavernSwapLimit } = await import("@/lib/hero/heroSwapLimit");
    const tier = opts.tier ?? 0;
    const priceLikes = await heroSwapPrice(tier);
    const limit = tavernSwapLimit(tier);
    if (!limit) {
      return {
        kind: "tavern",
        priceLikes,
        swaps: null,
        can: false,
        reasonKey: "braid.tavern_unfinished",
      };
    }
    const { tavernSwapState } = await import("./tavern-limit");
    const swaps = await tavernSwapState(await walletList(wallet), { mapId, q, r }, limit);
    return { kind: "tavern", priceLikes, swaps, can: true, reasonKey: null };
  }

  // Университет живёт своим модулем: он работает со второго тира и меняет
  // не облик, а доход — поэтому «достроен» ему безразлично, важен уровень.
  if (effect === "university") {
    const { universityExtra } = await import("./university-extra");
    return universityExtra({ wallet, tier: opts.tier ?? 0 });
  }

  // Музей: тоже «дом на карте» для механики из раздела Фишки, только там —
  // фарм билетов с коллекций. У окна одно дело: показать список коллекций и
  // отдать билеты. Достроенность здесь не влияет на доход (он от коллекций),
  // но пока строится — окно скажет об этом и не даст клеймить.
  // built у общего вычисления — «последний тир»; для музея важна первая
  // готовность (тир 1), как у университета.
  if (effect === "museum") return { kind: "museum", built: (opts.tier ?? 0) >= 1 };

  // Турнир: окно с таблицами турниров. Админ ставит это поведение на любую
  // постройку, тир не важен; «игрок рядом» проверяют ручки окна (tour-read.ts).
  if (effect === "tournament") return { kind: "tournament" };

  // Казино: окно слота на золото, игра и деньги — server/api/slot. Входу через
  // Google казино не показываем вовсе (владелец, 06.11.2026) — постройка без действия.
  if (effect === "casino") return isGoogleOnlyTg(getSessionTgId()) ? null : { kind: "casino" };

  // «Корона гречневого королевства»: всем, кто вошёл (08.11; не админам — на
  // фантики, server/api/buckwheat).
  if (effect === "buckwheat") return (await buckwheatOpen()) ? { kind: "buckwheat" } : null;

  // Лавка зачарования: только вход. Заклинания, артефакты и «герой рядом» —
  // ручки окна (enchant/), как у турнира.
  if (effect === "enchant") return { kind: "enchant" };
  if (effect === "hero_enchant") return { kind: "hero_enchant" };

  if (effect === "shipyard") {
    const tier = opts.tier ?? 0;
    const priceLikes = shipPriceFor(hero?.spec ?? null);
    // Пороги тира, а не «достроена»: обычный со 2-го тира, большой с 3-го. `built`
    // — страховка для не-трёх-тирных верфей (одно-тирная достроена сразу).
    const canSmallTier = built || tier >= SHIPYARD_TIER_SMALL;
    const bigAvailable = tier >= SHIPYARD_TIER_BIG;
    const bigInfo = { bigAvailable, bigWood: BIG_SHIP_WOOD, bigItemName: BIG_SHIP_ITEM_NAME };
    if (!canSmallTier) {
      return {
        kind: "shipyard",
        priceLikes,
        can: false,
        reasonKey: "braid.shipyard_unfinished",
        ...bigInfo,
        bigCan: false,
        bigReasonKey: "braid.shipyard_unfinished",
      };
    }
    // Кнопку и сам спуск (ship-action.createShip) считает один запрос: иначе
    // окно верфи писало бы «нет воды» там, где спуск проходит.
    // Обычному нужна не-океанская вода, большому — любая (в т.ч. океан).
    const bypass = canIgnoreVoid(wallet);
    const [waterSmall, waterBig] = await Promise.all([
      freeWaterAround(mapId, q, r, bypass, "small"),
      bigAvailable ? freeWaterAround(mapId, q, r, bypass, "big") : Promise.resolve(null),
    ]);
    return {
      kind: "shipyard",
      priceLikes,
      can: !!waterSmall,
      reasonKey: waterSmall ? null : "braid.no_free_water",
      ...bigInfo,
      bigCan: bigAvailable && !!waterBig,
      bigReasonKey: !bigAvailable ? null : waterBig ? null : "braid.no_free_water",
    };
  }

  if (effect === "portal") {
    const { portalExtra } = await import("./portal-extra");
    // Уровень выбранного героя: по нему портал решает, пускать ли. Отдельный
    // запрос — у hero в extra только раса и специализация.
    const { selectedHeroRow } = await import("./hero-current");
    const row = await selectedHeroRow(wallet).catch(() => null);
    // Где стоит игрок: дверь под ногами уже пройдена, а портал сети с неё
    // работает — отходить на шаг и возвращаться не надо.
    const { playerCell } = await import("./encounter-where");
    const pos = await playerCell(wallet).catch(() => null);
    return portalExtra({
      built,
      mapId,
      q,
      r,
      cellConfig: opts.cellConfig,
      heroLevel: row ? Number(row.level) : null,
      standingHere: !!pos && pos.q === q && pos.r === r,
      // Портал острова: сколько ачивок готово, пока не все (§8.57).
      gateDone: built
        ? await (await import("../achievements/gate")).islandGateBlock(wallet, mapId)
        : null,
      demo: await (await import("./island/demo-map")).isDemoMap(mapId),
    });
  }

  if (effect === "mine") return mineExtra(opts);

  // Склад: сколько ячеек занято. Содержимое отдаёт своя ручка (warehouse.ts) —
  // окно постройки не тащит десять стеков ради строчки «занято 3 из 10».
  if (effect === "warehouse") {
    const { warehouseCellsUsed } = await import("./warehouse-store");
    const used = built ? await warehouseCellsUsed(wallet, mapId, q, r) : { own: 0, shared: 0 };
    const { SHARED_CELLS } = await import("@/lib/warehouseCells");
    const { ownCellsOf } = await import("./account-upgrade");
    const { accAccountId } = await import("../currency/move");
    const account = await accAccountId(wallet).catch(() => null);
    return {
      kind: "warehouse",
      ownCells: await ownCellsOf(account),
      sharedCells: SHARED_CELLS,
      ownUsed: used.own,
      sharedUsed: used.shared,
      can: built,
      reasonKey: built ? null : "braid.wh_unfinished",
    };
  }

  // Грядка: поле с героями. Считает отдельный модуль — он же обслуживает окно.
  if (effect === "field") {
    const { fieldExtra } = await import("./field-extra");
    return fieldExtra(opts);
  }

  // Лавка построек — та же витрина, что у маркета (товар — постройка, lib/buildingSale).
  if (effect === "market" || effect === "building_shop") return marketExtra(opts);

  // Покои: за плату снимают дебаффы игрока и оглушения/яды с его фишек.
  if (effect === "chambers") {
    const { chambersExtra } = await import("./chambers-extra");
    return chambersExtra(opts);
  }

  const owner = await raidOwner(wallet);
  const used = built ? await buildingUsed(owner, mapId, q, r, "watchtower") : false;
  return {
    kind: "watchtower",
    energy: TOWER_ENERGY,
    radius: TOWER_RADIUS,
    used,
    can: built && !used,
    reasonKey: !built ? "braid.tower_unfinished" : used ? "braid.tower_used" : null,
  };
}
