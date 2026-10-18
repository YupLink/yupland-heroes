// Черновик автораздачи: то, что админ набирает пальцами, и его перевод в план
// для сервера.
//
// Числовые поля живут СТРОКАМИ. Поле, стёртое до пустоты, обязано остаться
// пустым, пока в нём стоит курсор: гнать его через Number на каждом нажатии —
// значит подставлять ноль под палец (та же беда, что чинил NumField маркета).
// Строки становятся числами один раз, перед отправкой.
//
// Пустое поле количества у кучек значит НЕ ноль, а «посчитай сам»: сервер берёт
// фонд и делит на 10 000. Поэтому у сундуков и монеток count = number | null, и
// пустоту нельзя схлопывать в ноль по дороге.
import { PILE_FUND_STEP } from "@/lib/raid/scatterMath";
import {
  MAX_PER_GROUP,
  type ArtifactPlan,
  type BossPlan,
  type PilePlan,
  type ScatterArt,
  type ScatterFund,
  type ScatterPack,
  type ScatterPlan,
  type ScatterLand,
} from "@/lib/raid/scatterPlan";
import { parseSeedInput } from "@/lib/raid/zonegen/seed";
import { parseLevelRange } from "@/lib/raid/levelRange";

export type FundKind = ScatterFund["kind"];

/**
 * Потолок группы и шаг фонда — из общего договора, своих копий тут нет: клиент
 * режет ровно теми же числами, которыми считает сервер. Иначе набранные
 * «200000» улетели бы в отказ схемы: вместо понятного «максимум 5 000» админ
 * получил бы красный тост про валидацию.
 */
export { MAX_PER_GROUP, PILE_FUND_STEP };

/** Набрано больше потолка — форме есть что сказать вслух. */
export function overCap(raw: string): boolean {
  const n = Number(raw.replace(",", ".").trim());
  return Number.isFinite(n) && n > MAX_PER_GROUP;
}

export type FundDraft = {
  kind: FundKind;
  token: string | null;
  amount: string;
  /** Для kind:"resource" — код ресурса (wood/stone/…). */
  resource?: string | null;
  /** Для kind:"custom" — id своего товара (cst_…). */
  itemId?: string | null;
};
export type PackDraft = { packId: string; count: string };
export type ArtDraft = { rarity: string | null; templateIds: string[]; count: string };

export type BossDraft = {
  enabled: boolean;
  removeKilled: boolean;
  count: string;
  levelMin: string;
  levelMax: string;
  /** Уровни местности одним полем: «5» или «1-10»; пусто — везде. */
  terrainLevel?: string;
  funds: FundDraft[];
  packs: PackDraft[];
  arts: ArtDraft[];
  lands: LandDraft[];
};

export type PileDraft = {
  enabled: boolean;
  removeKilled: boolean;
  /** Пусто — количество считает сервер по фонду (и по точке, если она задана). */
  count: string;
  /** «Среднее значение» кучки — середина разброса. Пусто — точку подберёт сервер. */
  point: string;
  funds: FundDraft[];
  templateIds: string[];
  lands: LandDraft[];
};

/**
 * Отмеченная местность в форме. Число — строкой, как все поля панели: пустая
 * строка значит «делит общее „Сколько“ раздела», а не ноль.
 */
export type LandDraft = { terrainId: string; count: string };

export type ArtifactDraft = {
  enabled: boolean;
  removeKilled: boolean;
  count: string;
  rarities: string[];
  templateIds: string[];
  lands: LandDraft[];
};

export type ScatterDraft = {
  /**
   * Сид раздачи как ТЕКСТ: число или фраза («осенний завоз»). Пусто — прежний
   * жребий, раскладку не повторить. Разбор — parseSeedInput, как у зон.
   */
  seed: string;
  boss: BossDraft;
  /** Сундуки и монетки одним разделом: вид решает шаблон, а не форма. */
  loot: PileDraft;
  artifacts: ArtifactDraft;
};

/** Пустое число — «делит общее „Сколько“» (null); ноль — осознанное «сюда не класть». */
function lands(list: LandDraft[]): ScatterLand[] {
  return list
    .filter((l) => l.terrainId)
    .map((l) => ({
      terrainId: l.terrainId,
      count: l.count.trim() === "" ? null : intOf(l.count, 0, MAX_PER_GROUP),
    }));
}

/** Целое из поля: мусор и пустота — минимум, дробь режем вниз. */
export function intOf(raw: string, min: number, max: number): number {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** Сумма фонда: дробная (USDT кладут по 0,5), отрицательной не бывает. */
export function amountOf(raw: string): number {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Шесть знаков — предел точности токенов, дальше только мусор округления.
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Фонды к отправке.
 *
 * Токен без выбранного символа выбрасываем: сервер не поймёт, ЧТО класть, а
 * молчаливая награда «неизвестно чего» — худший из вариантов. Нулевые строки
 * тоже убираем: они ничего не раздают, но у кучек портят автосчёт.
 */
function funds(list: FundDraft[]): ScatterFund[] {
  return list
    .filter((f) => {
      if (amountOf(f.amount) <= 0) return false;
      if (f.kind === "token") return !!f.token;
      if (f.kind === "resource") return !!f.resource;
      if (f.kind === "custom") return !!f.itemId;
      return true;
    })
    .map((f) => ({
      kind: f.kind,
      token: f.kind === "token" ? f.token : null,
      resource: f.kind === "resource" ? (f.resource ?? null) : null,
      itemId: f.kind === "custom" ? (f.itemId ?? null) : null,
      amount: amountOf(f.amount),
    }));
}

/** Паки: невыбранный пак и нулевой тираж на карту не едут. */
function packs(list: PackDraft[]): ScatterPack[] {
  return list
    .filter((p) => p.packId.trim() !== "" && intOf(p.count, 0, MAX_PER_GROUP) > 0)
    .map((p) => ({ packId: p.packId.trim(), count: intOf(p.count, 0, MAX_PER_GROUP) }));
}

/** Артефакты в награду: без количества строка бессмысленна. */
function arts(list: ArtDraft[]): ScatterArt[] {
  return list
    .filter((a) => intOf(a.count, 0, MAX_PER_GROUP) > 0)
    .map((a) => ({
      rarity: a.rarity,
      templateIds: a.templateIds,
      count: intOf(a.count, 0, MAX_PER_GROUP),
    }));
}

function bossPlan(d: BossDraft): BossPlan {
  // Диапазон разворачиваем сами: «с 10 по 3» — обычная опечатка, а не запрет.
  const a = intOf(d.levelMin, 1, 100);
  const b = intOf(d.levelMax, 1, 100);
  return {
    enabled: d.enabled,
    removeKilled: d.removeKilled,
    count: intOf(d.count, 0, MAX_PER_GROUP),
    levelMin: Math.min(a, b),
    levelMax: Math.max(a, b),
    terrainLevel: parseLevelRange(d.terrainLevel),
    funds: funds(d.funds),
    packs: packs(d.packs),
    arts: arts(d.arts),
    lands: lands(d.lands),
  };
}

function pilePlan(d: PileDraft): PilePlan {
  // Точка дробная: у USDT кучка бывает в две копейки. Ноль и мусор читаем как
  // «не задана» — иначе пустое поле обнулило бы номинал всей группы.
  const point = amountOf(d.point);
  return {
    enabled: d.enabled,
    removeKilled: d.removeKilled,
    count: d.count.trim() === "" ? null : intOf(d.count, 0, MAX_PER_GROUP),
    point: point > 0 ? point : null,
    funds: funds(d.funds),
    templateIds: d.templateIds,
    lands: lands(d.lands),
  };
}

function artifactPlan(d: ArtifactDraft): ArtifactPlan {
  return {
    enabled: d.enabled,
    removeKilled: d.removeKilled,
    count: intOf(d.count, 0, MAX_PER_GROUP),
    rarities: d.rarities,
    templateIds: d.templateIds,
    lands: lands(d.lands),
  };
}

export function toScatterPlan(d: ScatterDraft): ScatterPlan {
  // Пара разделов остаётся в договоре, но выключенной: добычу считает `loot`.
  const off = { ...pilePlan(d.loot), enabled: false };
  const seed = d.seed.trim() ? parseSeedInput(d.seed).seed : null;
  return {
    seed,
    boss: bossPlan(d.boss),
    loot: pilePlan(d.loot),
    chests: off,
    coins: off,
    artifacts: artifactPlan(d.artifacts),
  };
}

// Стартовый черновик — в своём модуле (лимит 250 строк).
export { emptyScatterDraft } from "./scatterDraftEmpty";

/** Ничего не включено — считать и раздавать нечего. */
export function nothingEnabled(d: ScatterDraft): boolean {
  return !d.boss.enabled && !d.loot.enabled && !d.artifacts.enabled;
}
