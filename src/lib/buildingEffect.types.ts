// Типы эффектов построек: что постройка отдаёт клиенту (BuildingExtra) и из чего
// складывается цена услуги. Вынесены из buildingEffect.ts, чтобы и модуль логики,
// и его потребители оставались в лимите ≤250 строк. buildingEffect.ts их
// ре-экспортит, поэтому внешние импорты `@/lib/buildingEffect` не меняются.
import type { MarketItemView } from "./marketItemView";
import type { SpellbookExtra } from "./spellbookExtra";
import type { MineExtra } from "./mineExtra";
import type { OblivionExtra } from "./oblivionConfig";
import type { TownHallExtra } from "./townHallView";
import type { PortalPrice } from "./portal";
import type { FieldReward } from "./fieldConfig";
import type { BoostEffect, BoostNumStat } from "./hero/boost";

export type BuildingEffect =
  | "portal"
  | "shipyard"
  | "watchtower"
  | "leveltree"
  | "sign"
  | "tavern"
  | "mine"
  | "field"
  | "warehouse"
  | "market"
  | "university"
  | "museum"
  // Ратуша: склад и цены города. Лавки привязываются к ней галочкой в своей
  // настройке (server/api/beta-raid/town-binding.ts).
  | "town_hall"
  // Алтарь-БУСТ: за плату временно прибавляет герою пункты характеристики.
  | "boost"
  // СТОЛБ ЗАКЛИНАНИЙ: у него учат заклинания и забывают выученные.
  | "spellbook"
  // ЗАБВЕНИЕ: за плату вешает на игрока эффект «Забвение» (oblivionConfig.ts).
  | "oblivion"
  // ПОКОИ: герой отдыхает и с игрока снимаются дебаффы (замедление,
  // ослабления атаки/защиты/удачи/интеллекта, оглушение и яд у фишек).
  // Цена — как у дерева уровней: несколько вариантов, игрок выбирает.
  | "chambers"
  // ТУРНИР: окно с таблицами турниров (lib/tournament). Админ ставит на любую постройку.
  | "tournament"
  // КАЗИНО: слот «Раскопки» на золото (lib/slot, server/api/slot). По имени
  // «Казино» включается само.
  | "casino"
  | null;

/** Чем платят за услугу постройки. Энергия — только у дерева уровней. */
export type ServicePrice = {
  kind: "tickets" | "likes" | "token" | "energy";
  /** Символ токена, если платят токеном. */
  token?: string | null;
  amount: number;
};

/** Цена как ключ словаря + подстановки: язык выбирает интерфейс, не модуль. */
export type PriceLabel = { key: string; params: Record<string, string | number> };

/** Что достроенная постройка предлагает сверх смены облика (сервер → окно). */
export type BuildingExtra =
  | {
      kind: "shipyard";
      /** Обычный корабль — цена лайками. */
      priceLikes: number;
      can: boolean;
      /** Причина отказа — ключом словаря: сервер не знает язык игрока. */
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
      /** Большой корабль открывается с 3-го тира верфи. */
      bigAvailable: boolean;
      /** Можно ли сейчас спустить большой (доступен И есть свободная вода). */
      bigCan: boolean;
      /** Цена большого: дерево + товар. */
      bigWood: number;
      bigItemName: string;
      bigReasonKey: string | null;
    }
  | {
      kind: "leveltree";
      /** Варианты оплаты, заданные админом. Пусто — дерево не настроено. */
      prices: ServicePrice[];
      /** Кого прокачиваем: выбранный герой игрока. */
      hero: { id: string; name: string; level: number; maxLevel: number } | null;
      /** Дерево работает один раз на игрока. */
      used: boolean;
      can: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
    }
  | {
      kind: "sign";
      /** Что админ написал на этой табличке. Читают бесплатно. */
      text: string;
    }
  | {
      kind: "tavern";
      /** Сколько лайков просит трактирщик за смену основного героя. */
      priceLikes: number;
      /**
       * Сколько смен даёт тир и когда вернётся потраченная (мс).
       * null — трактир ещё строится, смен не даёт вовсе.
       */
      swaps: { charges: number; left: number; nextAt: number | null } | null;
      can: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
    }
  | {
      kind: "watchtower";
      energy: number;
      radius: number;
      /** Разведка с одной вышки работает один раз на игрока. */
      used: boolean;
      can: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
    }
  | {
      kind: "warehouse";
      /** Сколько ячеек личных и общих, и сколько из них уже занято. */
      ownCells: number;
      sharedCells: number;
      ownUsed: number;
      sharedUsed: number;
      can: boolean;
      reasonKey: string | null;
    }
  | {
      kind: "field";
      /** Что растёт: ресурс со счёта или свой товар из справочника. */
      reward: FieldReward;
      /** Сколько за час даёт ПОЛЕ целиком — делится между работниками. */
      yieldAmount: number;
      /** Сколько героев сейчас работает на поле. */
      workers: number;
      /** Мой герой на поле: имя, если поставлен. */
      myHero: { id: string; name: string } | null;
      /** Моя доля в час при нынешнем числе работников. */
      share: number;
      can: boolean;
      reasonKey: string | null;
    }
  // Шахта — своим модулем (mineExtra.ts): союз и без неё на пределе 250 строк.
  | MineExtra
  | {
      kind: "portal";
      /** Номер сети; 0 — дверь (платный проход без переноса). */
      group: number;
      /** Как эта сеть называется у админа: «Подземка», «Дверь». */
      groupName: string;
      /** Что просят за проход. Пусто — бесплатно. */
      prices: PortalPrice[];
      /** Ограничение по уровню героя строкой: «5–10», «5+», «≤ 10». */
      level: string | null;
      /** Сколько выходов у сети, кроме этого входа. У двери — 0. */
      exits: number;
      can: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
      /** Портал острова новичка: выход навсегда — кнопка сначала спросит. */
      island?: boolean;
    }
  | {
      // Университет: стейкинг фишек ради лайков. Работает со ВТОРОГО тира
      // (первый — стройка), и уровень тут важнее, чем «достроен».
      kind: "university";
      /** 0 — ещё стройка. */
      level: number;
      /** Множитель фарма этого здания: ×1, ×1.2, ×1.4 … */
      bonus: number;
      /** Сколько фишек аккаунта сейчас в стейкинге (в любом университете). */
      staked: number;
      /** Накоплено в БАЗОВЫХ лайках — без множителя. */
      pending: number;
    }
  | {
      // Музей: та же механика, что «фарм коллекций» в разделе Фишки — здесь у
      // неё дом на карте. Собранные коллекции ФАРМЯТ билеты, забирают в
      // самом музее.
      kind: "museum";
      /** Достроен ли до последнего тира. Пока нет — окно скажет «строится». */
      built: boolean;
    }
  // Турнир: только вход в окно — плашки и таблицы отдают ручки tour-read.ts.
  | { kind: "tournament" }
  // Казино: вход в слот на золото на весь экран.
  | { kind: "casino" }
  | {
      kind: "boost";
      /** Что даёт алтарь: у одного может быть несколько прибавок. */
      effects: BoostEffect[];
      /** Что просят за подход. Пусто — бесплатно. */
      prices: PortalPrice[];
      /** Какие бусты висят на игроке ПРЯМО СЕЙЧАС. Пусто — ни одного. */
      active: Array<{ stat: BoostNumStat; value: number; expiresAt: string }>;
      /** Имя героя, которого усилят: игрок должен видеть, кому достанется. */
      heroName: string | null;
      can: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
    }
  | {
      kind: "chambers";
      /** Варианты оплаты, заданные админом. Пусто — покои ещё не настроены. */
      prices: ServicePrice[];
      /** Что сейчас висит на игроке — окно показывает, чтобы игрок видел, что уйдёт. */
      active: Array<{
        kind: string;
        value: number;
        expiresAt: string;
        /** Тип для UI: замедление / ослабление / оглушение фишки / яд. */
        group: "slow" | "weaken" | "stun" | "poison";
        /** Имя источника: у stun/poison — фишка, у остальных null. */
        source: string | null;
      }>;
      can: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
    }
  // Столб заклинаний и «Забвение» — своими модулями: союз на пределе 250 строк.
  | SpellbookExtra
  | OblivionExtra
  | TownHallExtra
  | {
      kind: "market";
      /** Товары витрины с ценой и отметкой доступности герою. */
      items: MarketItemView[];
      /**
       * Ограничения витрины: расы и специализации, для которых магазин работает.
       * Пустые оба списка — фильтра нет, продаётся всем; иначе окно рисует
       * баннер сверху вместо строки на каждой карточке.
       */
      shopRaces: string[];
      shopSpecs: string[];
      /** Проходит ли ВЫБРАННЫЙ герой фильтр витрины (баннер зелёный/красный). */
      heroFits: boolean;
      /** Лавка в голодающем городе: только приём еды. */
      townStarving?: boolean;
      reasonKey: string | null;
      reasonParams?: Record<string, string | number>;
    }
  | null;

// Товар витрины живёт отдельным модулем (marketItemView), но ре-экспортится
// отсюда: потребители берут его из `@/lib/buildingEffect`, как и раньше.
export type { MarketItemView } from "./marketItemView";
export type { SpellbookExtra } from "./spellbookExtra";
export type { MineExtra, MineResource } from "./mineExtra";
