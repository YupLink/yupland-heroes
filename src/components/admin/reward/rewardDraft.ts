// Контракт данных редактора наград: типы, пресеты распределения и перевод
// «черновик ↔ серверный RewardConfig».
//
// Жил внутри RewardConfigEditor.tsx, пока тот не разросся втрое над лимитом
// файла. Вынесен КАК ЕСТЬ (поведение сохранения прежнее), а сам редактор его
// ре-экспортирует — все старые импорты продолжают работать.
import { isRewardResource, type RewardResource } from "@/lib/rewardKinds";

// ─── Типы (были продублированы в BossScreen; теперь живут здесь) ───
export type FillerKind = "likes" | "tickets" | "energy" | "token" | "resource" | "custom";
export type Filler = {
  kind: FillerKind;
  amount: number;
  /** Символ токена у kind='token' (DARAI, USDT…). */
  token?: string | null;
  /** Ресурс счёта у kind='resource'. Токен сюда НЕ кладут — у него свой вид. */
  resource?: RewardResource | null;
  /** Шаблон своего товара (cst_…) у kind='custom' — уедет в рюкзак героя. */
  itemId?: string | null;
  /** kind='custom' — штучно первым N местам, как пак. По умолчанию первому. */
  toPlace?: number | null;
};
export type PackReward = { packId: string; toPlace: number };
export type ItemReward = { itemTemplateId: string; toPlace: number };
export type RewardConfig = {
  fillers: Filler[];
  split: number[];
  packs: PackReward[];
  /** Необязательные: старые конфиги (недельный босс) поля `items` не знают
   *  вовсе, и требовать его значило бы не принимать их на чтении. */
  items?: ItemReward[];
};
export type DraftFiller = {
  kind: FillerKind;
  amount: string;
  token?: string | null;
  resource?: RewardResource | null;
  itemId?: string | null;
  /** Строкой, как остальные числа черновика: поле ввода отдаёт текст. */
  toPlace?: string | null;
};
export type DraftConfig = {
  fillers: DraftFiller[];
  split: string[];
  packs: { packId: string; toPlace: string }[];
  items: { itemTemplateId: string; toPlace: string }[];
};

export const DEFAULT_SPLIT = [25, 18, 13, 10, 8, 6, 5, 5, 5, 5];
export const TOP20 = [25, 15, 11, 8, 7, 6, 5, 4, 3, 3, 2, 2, 2, 1.5, 1.5, 1, 1, 1, 0.5, 0.5];

// ─── Пресеты распределения (сумма ≈ 100%, дрейф округления правим у 1 места) ───
function fixTo100(input: number[]): string[] {
  const pct = [...input]; // не мутируем вход
  const drift = Math.round((100 - pct.reduce((a, b) => a + b, 0)) * 10) / 10;
  pct[0] = Math.round((pct[0] + drift) * 10) / 10;
  return pct.map(String);
}
export function genSplit(n: number): string[] {
  const w = Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, 0.9));
  const s = w.reduce((a, b) => a + b, 0);
  return fixTo100(w.map((x) => Math.round((x / s) * 1000) / 10));
}
export function genFlat(n: number): string[] {
  const each = Math.round((100 / n) * 10) / 10;
  return fixTo100(Array(n).fill(each));
}

// ─── Черновик (сырые строки) ↔ серверный RewardConfig (числа) ───
export function clampNum(raw: string, min: number, max: number, int = true): number {
  let n = Number(raw);
  if (!Number.isFinite(n)) n = min;
  if (int) n = Math.floor(n);
  return Math.max(min, Math.min(max, n));
}
export const DEF_CFG: DraftConfig = {
  fillers: [],
  split: DEFAULT_SPLIT.map(String),
  packs: [],
  items: [],
};
export const toDraftCfg = (c: RewardConfig): DraftConfig => ({
  // toPlace числом → строкой руками: спред затащил бы число в строковое поле.
  fillers: c.fillers.map((fl) => ({
    ...fl,
    amount: String(fl.amount),
    toPlace: fl.toPlace != null ? String(fl.toPlace) : null,
  })),
  split: c.split.map(String),
  packs: c.packs.map((pk) => ({ ...pk, toPlace: String(pk.toPlace) })),
  items: (c.items ?? []).map((it) => ({ ...it, toPlace: String(it.toPlace) })),
});

/**
 * Чего наполнителю не хватает, чтобы его вообще можно было выдать. null — всё
 * на месте. Текст админский, русский — как и вся остальная админка.
 *
 * Токен без символа ушёл бы в раздачу pending без ft_contract; ресурс без кода
 * и свой товар без шаблона — начислением в никуда.
 *
 * ⚠️ Условие по товару повторяет серверный разбор (reward-filler.ts,
 * parseFiller): там id без префикса `cst_` тоже считается мусором. Разойдись
 * они — админ сохранил бы строку, которую сервер молча выбросит на раздаче.
 */
export function fillerProblem(fl: DraftFiller): string | null {
  if (fl.kind === "token" && !fl.token) return "токен без монеты";
  if (fl.kind === "resource" && !isRewardResource(fl.resource)) return "ресурс без кода";
  if (fl.kind === "custom" && !(fl.itemId ?? "").startsWith("cst_")) return "товар без шаблона";
  return null;
}

/**
 * Строки фонда, которые сохранение молча выбросит. Пусто — можно сохранять.
 * Зовётся ПЕРЕД fromDraftCfg: тот такие строки просто отфильтрует, и админ
 * увидит «Сохранено» на награде, которой уже нет (жалоба на «вписал 1000, а
 * настройка исчезла»).
 */
export function draftProblems(c: DraftConfig): string[] {
  return c.fillers.map(fillerProblem).filter((p): p is string => p !== null);
}

/** Наполнитель, который дойдёт до выдачи. Обратная сторона fillerProblem. */
function fillerUsable(fl: DraftFiller): boolean {
  return fillerProblem(fl) === null;
}

/**
 * Чистит поля чужих видов: админ выбрал ресурс, передумал и переключил на
 * «свой товар» — старый `resource` остался бы лежать в jsonb и путать разбор.
 */
function trimFiller(fl: DraftFiller): Omit<Filler, "amount"> {
  return {
    kind: fl.kind,
    token: fl.kind === "token" ? (fl.token ?? null) : null,
    resource: fl.kind === "resource" ? (fl.resource ?? null) : null,
    itemId: fl.kind === "custom" ? (fl.itemId ?? null) : null,
    // Товар штучный: «до места N», как пак. Пусто — только первому месту.
    toPlace:
      fl.kind === "custom" ? clampNum(fl.toPlace ?? "1", 1, Number.MAX_SAFE_INTEGER, true) : null,
  };
}

export const fromDraftCfg = (c: DraftConfig): RewardConfig => ({
  fillers: c.fillers.filter(fillerUsable).map((fl) => ({
    ...trimFiller(fl),
    // Товар считается ШТУКАМИ: 2,7 слитка железа выдать нечем, режем до целого.
    amount: clampNum(fl.amount, 0, Number.MAX_SAFE_INTEGER, fl.kind === "custom"),
  })),
  split: c.split.map((s) => clampNum(s, 0, Number.MAX_SAFE_INTEGER, false)),
  // пустой пак (нажали «+ Пак», но не выбрали) — босс-схема min(1) упала бы, а
  // рейд-схема без min пропустила бы мусорный packId → неполучаемая награда.
  packs: c.packs
    .filter((pk) => pk.packId.trim() !== "")
    .map((pk) => ({
      ...pk,
      toPlace: clampNum(pk.toPlace, 1, Number.MAX_SAFE_INTEGER, true),
    })),
  items: (c.items ?? [])
    .filter((it) => it.itemTemplateId.trim() !== "")
    .map((it) => ({
      ...it,
      toPlace: clampNum(it.toPlace, 1, Number.MAX_SAFE_INTEGER, true),
    })),
});

/** Короткая подпись наполнителя (чипы наград в плеере). */
export function fillerMeta(fl: Filler): { icon: string; label: string } {
  switch (fl.kind) {
    case "likes":
      return { icon: "❤️", label: "лайки" };
    case "tickets":
      return { icon: "🎟", label: "билеты" };
    case "energy":
      return { icon: "⚡", label: "энергия" };
    case "resource":
      return { icon: "⛏", label: fl.resource ?? "ресурс" };
    case "custom":
      return { icon: "🎁", label: "товар" };
    default:
      return { icon: "🪙", label: fl.token ?? "токен" };
  }
}

/** Какой пресет сейчас активен (для подсветки). null = своё распределение. */
export function activePreset(split: string[]): string | null {
  const j = JSON.stringify(split.map((s) => Number(s)));
  if (j === JSON.stringify([100])) return "win";
  if (j === JSON.stringify([50, 30, 20])) return "top3";
  if (j === JSON.stringify(DEFAULT_SPLIT)) return "top10";
  if (j === JSON.stringify(TOP20)) return "top20";
  return null;
}
