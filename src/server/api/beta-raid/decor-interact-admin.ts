// Настройка взаимодействия с декором для админа: галочка, энергия, свой товар,
// количество («3» или «2-5»), необязательные инструменты (05.10 — список до 10,
// подходит любой; 1 шт. или износ за декор) и
// «Респавн, мин» (28.09; пусто — не возвращается), надпись действия ru/en (29.09;
// пусто — прежние тексты). Пишется в meta.interact шаблона декора
// слиянием на сервере (jsonb_set): остальная meta (walkable, flees) не трогается.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import {
  amountRange,
  amountText,
  costOf,
  LABEL_MAX,
  labelOf,
  labelTooLong,
  respawnOf,
  toolIdOf,
} from "@/lib/raid/decorInteract";
import { TOOLS_MAX, toolIdsOf } from "@/lib/raid/decorTools";
import { dropInteractiveDecorCache } from "./decor-interact";

function requireAdmin(): void {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ настраивает декор");
}

/** Все ли товары есть в справочнике — одним запросом. */
async function customItemsExist(ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_custom_item WHERE id IN (${ids.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  const found = new Set((rows ?? []).map((r) => String(r.id)));
  return ids.every((id) => found.has(id));
}

/**
 * Инструменты из формы: список (новая вкладка) или один toolItemId (старая
 * вкладка, one; "" — без инструмента). Нет ни того, ни другого — null: не
 * трогаем. Мусор — отказ, повторы схлопываются.
 */
type SentTools = { ids: string[]; one: boolean };
function sentTools(d: { toolItemIds?: string[]; toolItemId?: string }): SentTools | null {
  if (d.toolItemIds === undefined && d.toolItemId === undefined) return null;
  const raw = d.toolItemIds ?? (d.toolItemId ? [d.toolItemId] : []);
  if (raw.some((v) => !toolIdOf(v))) throw new Error("Инструмент — только свой товар");
  return { ids: [...new Set(raw)], one: d.toolItemIds === undefined };
}

/**
 * Список в meta. Старая вкладка шлёт один toolItemId — первый из списка, что
 * ей отдал сервер: совпал с сохранённым — список не трогаем, иначе её
 * «Сохранить» (поменяли энергию) молча срезало бы [Топор, Кирка] до Топора.
 * Другой инструмент — пишем [его].
 */
function toolsSqlOf(tools: SentTools | null): string {
  if (!tools) return `COALESCE(meta->'interact'->'toolItemIds', 'null'::jsonb)`;
  const first = tools.ids[0];
  if (!tools.one || !first) return `${sqlStr(JSON.stringify(tools.ids))}::jsonb`;
  const was = `meta->'interact'->'toolItemIds'`;
  return `CASE WHEN jsonb_typeof(${was}) = 'array'
                 AND ${sqlStr(first)} IN (meta->'interact'->>'toolItemId', ${was}->>0)
               THEN ${was} ELSE jsonb_build_array(${sqlStr(first)}) END`;
}

/** Как есть в meta — даже выключенное: форма открывается с прежними числами. */
export type DecorInteractDraft = {
  on: boolean;
  cost: number;
  itemId: string;
  amount: string;
  /** Первый инструмент списка; "" — без инструмента (старая вкладка). */
  toolItemId: string;
  /** Свои товары-инструменты, подходит любой; [] — без инструмента. */
  toolItemIds: string[];
  /** Через сколько минут срубленный декор вернётся; 0 — не вернётся. */
  respawnMin: number;
  /** Надпись действия; "" — нет, игра пишет прежнее («Уничтожить», «Срубить»). */
  label: { ru: string; en: string };
};

/** Надпись из meta для формы: пустые языки — "". */
function draftLabel(v: unknown): DecorInteractDraft["label"] {
  const l = labelOf(v);
  return { ru: l?.ru ?? "", en: l?.en ?? "" };
}

export const adminGetDecorInteract = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<DecorInteractDraft> => {
    requireAdmin();
    const rows = ((await mcpExec(
      `SELECT meta->'interact' AS interact FROM yuplink.mystic_item_template
        WHERE id = ${sqlStr(data.id)} AND kind = 'decoration' LIMIT 1;`,
      { wrapJson: true },
    )) ?? []) as Array<{ interact: Record<string, unknown> | null }>;
    const o = rows[0]?.interact ?? {};
    const range = amountRange(o.amount);
    const tools = toolIdsOf(o);
    return {
      on: o.on === true,
      cost: costOf(o.cost),
      itemId: typeof o.itemId === "string" ? o.itemId : "",
      amount: range ? amountText(range) : "",
      toolItemId: tools[0] ?? "",
      toolItemIds: tools,
      respawnMin: respawnOf(o.respawnMin) ?? 0,
      label: draftLabel(o.label),
    };
  });

export const adminSetDecorInteract = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(80),
        on: z.boolean(),
        cost: z.number().min(0).max(100_000),
        itemId: z.string().max(80),
        amount: z.string().max(40),
        // Список инструментов (05.10). Нет его — старая вкладка: её toolItemId
        // ("" — без инструмента); нет и того — инструменты не трогаем.
        toolItemIds: z.array(z.string().max(80)).max(TOOLS_MAX).optional(),
        toolItemId: z.string().max(80).optional(),
        // «Респавн, мин»: пусто/0 — не возвращается. Нет поля (старая
        // вкладка) — прежнее значение не трогаем.
        respawnMin: z.number().min(0).max(1_000_000).optional(),
        // Надпись действия ru/en: пустые строки — надписи нет. Нет поля
        // (старая вкладка) — прежнюю надпись не трогаем.
        label: z
          .object({ ru: z.string().max(200), en: z.string().max(200) })
          .partial()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const range = amountRange(data.amount);
    if (data.on) {
      if (!data.itemId.startsWith("cst_")) throw new Error("Выбери товар, который даёт декор");
      if (!range) throw new Error("Количество — число или диапазон «2-5»");
    }
    if (data.label && (labelTooLong(data.label.ru) || labelTooLong(data.label.en)))
      throw new Error(`Надпись — до ${LABEL_MAX} знаков`);
    const tools = sentTools(data);
    // Инструменты — существующие товары справочника: иначе декор молча выпадет
    // из взаимодействия (loadInteractiveDecor выключает его без инструмента).
    if (tools && !(await customItemsExist(tools.ids))) throw new Error("Инструмент не найден");
    const value = {
      on: data.on,
      cost: costOf(data.cost),
      itemId: data.itemId,
      amount: range ? amountText(range) : "",
    };
    // Старая вкладка без поля не должна снимать инструмент: иначе одно
    // «Сохранить» из неё делало декор бесплатным. Поле пришло — пишем список и
    // первый из него в toolItemId (его читает старый код).
    const toolSql = tools
      ? sqlStr(tools.ids[0] ?? "")
      : `COALESCE(meta->'interact'->>'toolItemId', '')`;
    const toolsSql = toolsSqlOf(tools);
    const respawn = data.respawnMin === undefined ? null : respawnOf(data.respawnMin);
    const respawnSql =
      data.respawnMin === undefined
        ? `COALESCE(meta->'interact'->'respawnMin', 'null'::jsonb)`
        : respawn
          ? `to_jsonb(${respawn})`
          : `'null'::jsonb`;
    // Надпись: та же защита от старой вкладки, что у инструмента и респавна.
    const label = data.label === undefined ? null : labelOf(data.label);
    const labelSql =
      data.label === undefined
        ? `COALESCE(meta->'interact'->'label', 'null'::jsonb)`
        : label
          ? `${sqlStr(JSON.stringify(label))}::jsonb`
          : `'null'::jsonb`;
    const rows = (await mcpExec(
      `UPDATE yuplink.mystic_item_template
          SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{interact}',
                ${sqlStr(JSON.stringify(value))}::jsonb || jsonb_build_object('toolItemId', ${toolSql})
                  || jsonb_build_object('toolItemIds', ${toolsSql})
                  || jsonb_build_object('respawnMin', ${respawnSql})
                  || jsonb_build_object('label', ${labelSql}))
        WHERE id = ${sqlStr(data.id)} AND kind = 'decoration'
        RETURNING id, meta->'interact'->>'toolItemId' AS "toolItemId",
                  meta->'interact'->'toolItemIds' AS "toolItemIds",
                  meta->'interact'->>'respawnMin' AS "respawnMin",
                  meta->'interact'->'label' AS label;`,
      { wrapJsonCte: true },
    )) as Array<{
      id: string;
      toolItemId: string | null;
      toolItemIds?: unknown;
      respawnMin: string | null;
      label?: unknown;
    }>;
    if (!rows?.length) throw new Error("Декор не найден");
    dropInteractiveDecorCache();
    const saved = toolIdsOf(rows[0]);
    return {
      ok: true as const,
      ...value,
      toolItemId: saved[0] ?? "",
      toolItemIds: saved,
      respawnMin: respawnOf(rows[0].respawnMin) ?? 0,
      label: draftLabel(rows[0].label),
    };
  });
