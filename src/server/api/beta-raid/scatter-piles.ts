// Кучки раздачи: сундуки и монетки. Сколько их встанет, по сколько в каждой и
// что именно уедет в клетку.
//
// Отдельно от боссов (scatter-build), потому что арифметика тут своя: потолок
// шаблона, «среднее значение» от админа и фонд как жёсткий потолок — боссам из
// этого не нужно ничего.
import { type RewardConfig } from "../raid-shared";
import { autoPileCount, pileCountByPoint, rollPiles } from "@/lib/raid/scatterMath";
import { landTotal, spreadLands } from "@/lib/raid/scatterLands";
import { capOf, type Tpl } from "./scatter-tpl";
import {
  draft,
  filler,
  fmt,
  fundNotes,
  pick,
  type GroupBuild,
  type ScatterDraft,
} from "./scatter-parts";
import type { Rnd } from "@/lib/raid/scatterMath";
import {
  fundLabel,
  GROUP_LABEL,
  MAX_PER_GROUP,
  pileStep,
  type PilePlan,
  type ScatterFund,
} from "@/lib/raid/scatterPlan";

/**
 * Кучка с карты забирается ОДНИМ тапом и за одну энергию — так просил владелец.
 *
 * Пишем это на саму КЛЕТКУ, а не в шаблон: шаблоны админ настраивал руками, и
 * правка шаблона задела бы все уже стоящие объекты. Оба поля клетка умеет
 * (cell-override): maxHp = 1 включает подбор без боя (encounter-pickup),
 * interactionCost = 1 задаёт цену входа.
 */
const PICKUP = { maxHp: 1, interactionCost: 1 };

/**
 * Номиналы кучек по одному фонду. Кучки одного шаблона считаются вместе (у
 * rollPiles один потолок на бросок), доля шаблона — по вместимости.
 *
 * Шаблон, у которого этой валюты в награде нет, в её раздаче НЕ участвует:
 * потолок у него нулевой, а нулевой потолок rollPiles читает как «потолка
 * нет» — и монетка с проектным номиналом 10 набрала бы миллионы. Если валюты
 * нет ни у одного шаблона, раздаём всем и без потолка: фонд админ вписал
 * осознанно, и молча его не разложить — хуже, чем разложить крупно.
 *
 * `starved` помечает кучки, до которых фонд не дотянулся: их номинал не 0 «по
 * бедности шаблона», а «денег больше нет» — и ставить их на карту нечем.
 */
function shareByCap(
  chosen: Tpl[],
  f: ScatterFund,
  point: number | null,
  notes: string[],
  label: string,
  starved: boolean[],
  rnd: Rnd,
): number[] {
  const out = new Array<number>(chosen.length).fill(0);
  const able = chosen.map((_, i) => i).filter((i) => capOf(chosen[i], f) > 0);
  const take = able.length > 0 ? able : chosen.map((_, i) => i);
  if (take.length === 0) return out;
  if (able.length > 0 && able.length < chosen.length) {
    notes.push(
      `${label}: ${fundLabel(f)} прописан не у всех шаблонов — валюту получат ` +
        `${fmt(able.length)} кучек из ${fmt(chosen.length)}`,
    );
  }

  const byTpl = new Map<string, number[]>();
  take.forEach((i) => byTpl.set(chosen[i].id, [...(byTpl.get(chosen[i].id) ?? []), i]));
  const avg = f.amount / take.length;
  const weight = (idx: number[]) => idx.length * (capOf(chosen[idx[0]], f) || avg);
  const sum = [...byTpl.values()].reduce((a, idx) => a + weight(idx), 0);
  if (sum <= 0) return out;

  for (const idx of byTpl.values()) {
    const tpl = chosen[idx[0]];
    const piles = rollPiles(idx.length, (f.amount * weight(idx)) / sum, capOf(tpl, f), {
      step: pileStep(f.kind),
      point,
      rnd,
    });
    piles.forEach((amount, k) => {
      out[idx[k]] = amount;
    });
    idx.slice(piles.length).forEach((i) => {
      starved[i] = true;
    });
  }
  return out;
}

/**
 * Точка разброса — если она вообще применима.
 *
 * Одно «среднее значение» на два фонда сразу — это либо копейки Darai, либо
 * тысячи USDT: применить его к обеим валютам значит соврать в одной из них.
 * Поэтому со вторым фондом точку не берём и говорим об этом в отчёте, а не
 * молча.
 */
function pointOf(plan: PilePlan, label: string, notes: string[]): number | null {
  const n = plan.point;
  if (!n || n <= 0) return null;
  if (plan.funds.length <= 1) return n;
  notes.push(`${label}: среднее значение ${fmt(n)} не применили — фондов у группы больше одного`);
  return null;
}

/** Сколько кучек ставим, когда админ число не задал: считаем от фонда. */
function autoCount(plan: PilePlan, point: number | null, label: string, notes: string[]): number {
  const fund = plan.funds.reduce((a, f) => Math.max(a, f.amount), 0);
  // Считаем БЕЗ потолка, чтобы было что сказать: потолок группы режет молча, а
  // админ, вписавший миллиард, обязан понимать, почему кучек 5 000, а не 100 000.
  const wanted =
    point === null
      ? autoPileCount(fund, Number.POSITIVE_INFINITY)
      : pileCountByPoint(fund, point, Number.POSITIVE_INFINITY);
  const count = Math.min(wanted, MAX_PER_GROUP);
  notes.push(
    point === null
      ? `${label}: число посчитано от фонда — ${fmt(count)} шт.`
      : `${label}: число посчитано от фонда и среднего значения — ${fmt(count)} шт.`,
  );
  if (wanted > count) {
    notes.push(
      `${label}: по фонду вышло бы ${fmt(wanted)} кучек — за раз кладём не больше ` +
        `${fmt(MAX_PER_GROUP)}; остальное следующим заходом`,
    );
  }
  if (count === 0 && point !== null && fund > 0) {
    notes.push(
      `${label}: среднее значение ${fmt(point)} крупнее фонда ${fmt(fund)} — ` +
        `на такую кучку не хватает даже одной`,
    );
  }
  return count;
}

/** Сундуки и монетки: число кучек и номиналы — жребием, потолок — из шаблона. */
export function buildPiles(
  plan: PilePlan,
  group: "chest" | "coin",
  tpls: Tpl[],
  rnd: Rnd = Math.random,
): GroupBuild {
  const label = GROUP_LABEL[group];
  if (tpls.length === 0) {
    return { group, drafts: [], notes: [`${label}: подходящих шаблонов не нашлось`] };
  }
  const notes: string[] = [];
  const point = pointOf(plan, label, notes);
  // Отмеченные местности задают счёт кучек так же, как боссам: их сумма важнее
  // поля «Сколько», а пустой выбор оставляет прежний автосчёт от фонда.
  const asked = plan.count === null ? autoCount(plan, point, label, notes) : plan.count;
  // План приходит и не из панели (старый клиент, ручной запрос) — без поля
  // местностей. Это не ошибка: значит выбора нет и всё как было.
  const picked = plan.lands ?? [];
  const count = picked.length > 0 ? landTotal(picked, asked) : asked;
  const spread = spreadLands(count, picked, asked);
  const chosen = Array.from({ length: count }, () => pick(tpls, rnd));
  const starved = new Array<boolean>(count).fill(false);
  const money = plan.funds.map((f) => shareByCap(chosen, f, point, notes, label, starved, rnd));

  const drafts: ScatterDraft[] = [];
  chosen.forEach((tpl, i) => {
    const cfg: RewardConfig = { fillers: [], split: tpl.split, packs: [], items: [] };
    plan.funds.forEach((f, k) => {
      if ((money[k][i] ?? 0) > 0) cfg.fillers.push(filler(f, money[k][i]));
    });
    // Фонд кончился на этой кучке: пустой сундук — обещание без денег, а игроку
    // он стоит энергии. Такую не ставим вовсе, а число назовём в примечаниях.
    if (cfg.fillers.length === 0 && starved[i]) return;
    // Местность из панели перебивает шаблонную; без выбора — как у шаблона.
    const land = picked.length > 0 ? (spread[i] ?? null) : tpl.land;
    drafts.push(draft(group, `chest:${tpl.id}`, land, cfg, PICKUP));
  });
  const lost = count - drafts.length;
  if (lost > 0) {
    notes.push(
      `${label}: фонда хватило на ${fmt(drafts.length)} кучек из ${fmt(count)} — ` +
        `остальные ${fmt(lost)} не поставили`,
    );
  }

  const why = "потолки шаблонов не пустили больше; возьми кучек больше или крупнее";
  notes.push(...fundNotes(label, plan.funds, money, why));
  return { group, drafts, notes };
}
