// Общие детали заготовок раздачи: что поедет на клетку и как об этом рассказать
// в отчёте.
//
// Отдельным файлом, потому что из этих кусков собираются и боссы
// (scatter-build), и кучки (scatter-piles): копия помощника в двух файлах
// разъехалась бы на первой же правке. Ни базы, ни клеток здесь нет.
import { type RewardConfig, type Filler } from "../raid-shared";
import { fundLabel, type ScatterFund, type ScatterGroup } from "@/lib/raid/scatterPlan";
import { mulberry32 } from "@/lib/raid/zonegen/noise";
import type { Rnd } from "@/lib/raid/scatterMath";

/**
 * Переопределения объекта на КЛЕТКЕ — тот же набор, что читает cell-override.
 *
 * Награда обязательна: объект без неё берёт награду шаблона, и сотня «пустых»
 * сундуков молча утянет из пула карты по своему номиналу каждый.
 */
export type DraftConfig = {
  rewardConfig: RewardConfig;
  /** Запас HP. 1 — объект забирается одним тапом, без боя (encounter-pickup). */
  maxHp?: number;
  /** Цена взаимодействия в энергии. */
  interactionCost?: number;
};

/** Заготовка объекта: всё, кроме клетки. */
export type ScatterDraft = {
  group: ScatterGroup;
  /** `boss:<tpl>` / `chest:<tpl>` / `artifact:<tpl>` — как на карте. */
  objectId: string;
  /** Что кладём в object_config клетки; null — шаблон не трогаем. */
  objectConfig: DraftConfig | null;
  /** Местность шаблона; null — любая суша. */
  terrainId: string | null;
};

export type GroupBuild = {
  group: ScatterGroup;
  drafts: ScatterDraft[];
  notes: string[];
  /** «Только эти местности» (уровень местности у боссов); нет — любая суша. */
  terrains?: string[] | null;
};

/**
 * Жребий по списку. Генератор — последним аргументом, как во всей математике
 * раздачи (scatterMath): с сидом раскладку можно повторить, без него — всё как
 * было. Бросок подрезаем по краям: генератор приходит из плана админа, и
 * единица на входе дала бы `undefined` вместо шаблона.
 */
export const pick = <T>(list: T[], rnd: Rnd = Math.random): T =>
  list[Math.min(list.length - 1, Math.max(0, Math.floor(Math.max(0, rnd()) * list.length)))];

/**
 * Кубик всей раздачи. Сид задан — mulberry32 (тот же, что крутит генератор
 * зон): один поток на запуск, поэтому повторяется и выбор шаблонов, и номиналы.
 * Сида нет — обычный Math.random, прежнее поведение.
 */
export const scatterRnd = (seed?: number | null): Rnd =>
  seed === null || seed === undefined || !Number.isFinite(seed)
    ? Math.random
    : mulberry32(Math.floor(Math.abs(seed)));

export const fmt = (n: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

/**
 * Наполнитель. Символ монеты живёт ТОЛЬКО у вида `token`: `{kind:"likes",
 * token:"Darai"}` выдаёт лайки, а не Darai (encounter-rewards подменяет вид
 * только у token). Такие строки в шаблонах карты уже лежат — не плодим.
 */
export const filler = (f: ScatterFund, amount: number): Filler => ({
  kind: f.kind,
  amount,
  token: f.kind === "token" ? (f.token ?? null) : null,
  // Ссылки для новых видов: ресурс единого счёта / id своего товара.
  // Без них Filler в очереди наград — «мусор без адреса».
  ...(f.kind === "resource" ? { resource: (f.resource ?? null) as never } : {}),
  ...(f.kind === "custom" ? { itemId: f.itemId ?? null, toPlace: 1 } : {}),
});

/**
 * С какой недодачи фонда шумим в примечаниях.
 *
 * Мера — процент от фонда: он одинаково честен и для миллиона лайков, и для
 * половины USDT. Нижняя ступенька разная, потому что разный квант: у лайков,
 * билетов и энергии это единица, у токена — копейка (суммы округляются до
 * сотых, и недодача в полкопейки — округление, а не пропажа). Прежний общий
 * `max(1, 1%)` на фонде 0,5 USDT не мог сработать никогда.
 */
const noiseOf = (f: ScatterFund): number =>
  Math.max(f.kind === "token" ? 0.01 : 1, f.amount * 0.01);

/**
 * Раздача — бросок, и до последней монеты фонд не расходится: у боссов так
 * работает сам бросок, у кучек режет потолок шаблона. Молчать нельзя: админ
 * вписал 5 млн, а на карту поступило 3,6, и он вправе знать почему.
 */
export function fundNotes(
  label: string,
  funds: ScatterFund[],
  money: number[][],
  why: string,
): string[] {
  const out: string[] = [];
  funds.forEach((f, k) => {
    const placed = (money[k] ?? []).reduce((a, x) => a + x, 0);
    if (f.amount - placed > noiseOf(f)) {
      out.push(
        `${label}: из фонда ${fmt(f.amount)} ${fundLabel(f)} разложено ${fmt(placed)} — ${why}`,
      );
    }
  });
  return out;
}

/** Заготовка с наградой поверх шаблона и, если надо, с правкой самого объекта. */
export function draft(
  group: ScatterGroup,
  objectId: string,
  terrainId: string | null,
  cfg: RewardConfig | null,
  extra?: Omit<DraftConfig, "rewardConfig">,
): ScatterDraft {
  return { group, objectId, terrainId, objectConfig: cfg ? { rewardConfig: cfg, ...extra } : null };
}
