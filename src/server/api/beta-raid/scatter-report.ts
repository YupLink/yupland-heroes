// Итог автораздачи: «на карту поступило столько-то» и «столько снимем».
//
// Считается по ФАКТИЧЕСКИ разложенным заготовкам, а не по плану: клеток могло
// не хватить, и обещать в отчёте то, чего на карте нет, нельзя.
//
// Артефакт-объект попадает в те же строки, что и артефакт в награде босса: с
// точки зрения «что зашло на карту» это один и тот же предмет, просто в одном
// случае он лежит под ногами, а в другом ждёт победителя.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { FUND_KIND_LABEL, type ScatterGroup } from "@/lib/raid/scatterPlan";
import { cellGroup, cellOrphan } from "./pile-kind";
import type { ScatterDraft } from "./scatter-build";

/**
 * Сколько какой монеты заготовки обещают игрокам.
 *
 * Только вид `token`: у остальных символ монеты — украшение, выдача его не
 * читает, и держать под него обеспечение было бы враньём в обе стороны.
 * Регистр символа игнорируем (в базе «Darai», в фонде мог приехать «darai»), а
 * наружу отдаём написание, встреченное первым, — им же подписан кошелёк.
 */
export function tokensOf(drafts: ScatterDraft[]): Array<{ symbol: string; amount: number }> {
  const sums = new Map<string, { symbol: string; amount: number }>();
  for (const d of drafts) {
    for (const f of d.objectConfig?.rewardConfig.fillers ?? []) {
      if (f.kind !== "token") continue;
      const symbol = (f.token ?? "").trim();
      if (symbol === "") continue;
      const key = symbol.toLowerCase();
      const row = sums.get(key) ?? { symbol, amount: 0 };
      row.amount += f.amount;
      sums.set(key, row);
    }
  }
  // Копейки float-сложения не должны превращать «ровно 1000» в «1000.0000001»:
  // с этим числом дальше сравнивают остаток кошелька.
  return [...sums.values()].map((r) => ({ ...r, amount: Math.round(r.amount * 1e6) / 1e6 }));
}

/** Название пака и артефакта — одним запросом на весь список. */
async function names(packIds: string[], itemIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const load = async (table: string, ids: string[], prefix: string) => {
    if (ids.length === 0) return;
    const rows = (await mcpExec(
      `SELECT id, name FROM ${table} WHERE id IN (${ids.map((s) => sqlStr(s)).join(",")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; name: string }>;
    for (const r of rows ?? []) out.set(`${prefix}${r.id}`, String(r.name ?? ""));
  };
  await Promise.all([
    load("yuplink.chip_packs", packIds, "pack:"),
    load("yuplink.mystic_item_template", itemIds, "item:"),
  ]);
  return out;
}

/**
 * «На карту поступило»: валюты, паки и артефакты одним списком.
 *
 * Ключи копятся техническими (`pack:cp_…`), а подписи навешиваются в конце —
 * иначе на каждый пак был бы свой поход в базу за названием.
 */
export async function tallyResources(
  drafts: ScatterDraft[],
): Promise<{ label: string; amount: number }[]> {
  const money = new Map<string, number>();
  const goods = new Map<string, number>();
  const add = (m: Map<string, number>, key: string, n: number) => m.set(key, (m.get(key) ?? 0) + n);

  for (const d of drafts) {
    const rc = d.objectConfig?.rewardConfig;
    if (!rc) {
      // Артефакт без своей награды отдаёт сам себя (encounter-rewards).
      if (d.group === "artifact") add(goods, `item:${d.objectId.split(":")[1] ?? ""}`, 1);
      continue;
    }
    for (const f of rc.fillers) {
      if (!(f.amount > 0)) continue;
      add(money, f.kind === "token" && f.token ? f.token : f.kind, f.amount);
    }
    for (const p of rc.packs) if (p.toPlace > 0) add(goods, `pack:${p.packId}`, p.toPlace);
    for (const it of rc.items) {
      if (it.toPlace > 0) add(goods, `item:${it.itemTemplateId}`, it.toPlace);
    }
  }

  const key = (prefix: string) =>
    [...goods.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const titles = await names(key("pack:"), key("item:"));

  // Ключ money — либо вид фонда, либо символ токена: у словаря видов ключи
  // литеральные, поэтому читаем его как обычную карту строк.
  const kindLabel: Record<string, string> = FUND_KIND_LABEL;
  const rows: { label: string; amount: number }[] = [];
  for (const [k, amount] of money) {
    // Токен подписываем его же символом: «Darai», «USDT» — так его и знает админ.
    rows.push({ label: kindLabel[k] ?? k, amount: Math.round(amount * 100) / 100 });
  }
  rows.sort((a, b) => b.amount - a.amount);

  const items: { label: string; amount: number }[] = [];
  for (const [k, amount] of goods) {
    const isPack = k.startsWith("pack:");
    const name = titles.get(k) || k.slice(k.indexOf(":") + 1);
    items.push({ label: `${isPack ? "Пак" : "Артефакт"} «${name}»`, amount });
  }
  items.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "ru"));
  return [...rows, ...items];
}

/** Убитые одной группы: сколько всего и сколько из них — сироты без шаблона. */
export type KilledCount = { total: number; orphan: number };

/**
 * Сколько убитых объектов лежит на карте — по группам.
 *
 * Нужно предпросмотру: снимать их будет scatter-apply, но обещать «снимем N»
 * надо ДО того, как что-то тронуто. Поэтому группу считает то же общее правило
 * (pile-kind.cellGroup), которым потом и снимут: пока выражение одно на двоих,
 * обещание не может разойтись с делом.
 *
 * Сироты (шаблон удалили) считаются ОТДЕЛЬНО, но входят в общее число: снимут
 * их вместе со всеми, и умалчивать об этом нельзя — по числу админ решает,
 * жать ли кнопку.
 *
 * Ошибку чтения НЕ глушим: предпросмотр «снимем 0» при живых семистах убитых —
 * это обещание, под которым раздача снимет сотни. Пусть лучше кнопка честно
 * покажет отказ.
 */
export async function countKilled(mapId: string): Promise<Record<ScatterGroup, KilledCount>> {
  const out: Record<ScatterGroup, KilledCount> = {
    boss: { total: 0, orphan: 0 },
    chest: { total: 0, orphan: 0 },
    coin: { total: 0, orphan: 0 },
    artifact: { total: 0, orphan: 0 },
  };
  const rows = (await mcpExec(
    `SELECT ${cellGroup("c")} AS grp,
            count(*)::int AS n,
            count(*) FILTER (WHERE ${cellOrphan("c")})::int AS orphan
       FROM yuplink.beta_raid_object_hp h
       JOIN yuplink.raid_map_cells c
         ON c.map_id = h.map_id AND c.q = h.q AND c.r = h.r AND c.object_id IS NOT NULL
      WHERE h.map_id = ${sqlStr(mapId)} AND h.cycle_no = 0 AND h.killed_at IS NOT NULL
      GROUP BY 1;`,
    { wrapJson: true },
  )) as Array<{ grp: string; n: number; orphan: number }>;
  for (const r of rows ?? []) {
    if (r.grp in out) {
      out[r.grp as ScatterGroup] = { total: Number(r.n) || 0, orphan: Number(r.orphan) || 0 };
    }
  }
  return out;
}
