// Список декора со «Взаимодействием» (владелец, 25.09) — чтение и кэш.
// Вынесено из decor-interact.ts (лимит ≤250 строк): там — рубка, здесь — что
// и чем рубится.
//
// Инструменты (05.10: несколько видов топоров) — список шаблона
// (meta.interact.toolItemIds, старое — toolItemId): имена, картинки и «Износ за
// удар» всех инструментов списка приходят тем же запросом, без N+1.
//
// Руками (17.10, §8.56): hand — среди инструментов шаблона есть деревянный или
// каменный топор; по нему окно рубки предлагает «Срубить руками».
import { mcpExec } from "../../db/mcpClient";
import { parseDecorInteract, type DecorInteract } from "@/lib/raid/decorInteract";
import type { DecorToolView } from "@/lib/raid/decorTools";
import { canChopByHand } from "@/lib/raid/handChop";
import { toolWearOf } from "@/lib/raid/toolWear";
import { canonStackKey } from "./item-alias";

/** Декор со взаимодействием глазами клиента: цена, что и сколько даёт, чем рубить. */
export type DecorInteractView = DecorInteract & {
  name: string;
  itemName: string;
  itemImage: string | null;
  /** Инструменты по порядку списка шаблона (удалённые из справочника выпали). */
  tools?: DecorToolView[];
  /** Первый инструмент списка — для старых клиентов и кэшей. */
  toolName?: string;
  toolImage?: string | null;
  /** «Износ за удар, %» первого инструмента; нет — ломается с первого удара. */
  toolWear?: number | null;
  /** Ключ стопки первого инструмента в рюкзаке (канон вида). */
  toolKey?: string;
  /**
   * Рубится руками (§8.56): в списке шаблона деревянный или каменный топор.
   * Сервер пишет всегда; нет поля (старый ответ из persist-кэша) — не рубится.
   */
  hand?: boolean;
};

/** Настройки меняет админ, а не игра: полминуты кэша с запасом. */
const TTL_MS = 30_000;
let cache: { expires: number; value: Record<string, DecorInteractView> } | null = null;

type ToolRow = { id?: unknown; name?: unknown; image?: unknown; wear?: unknown };

type Row = {
  id: string;
  name: string | null;
  interact: unknown;
  item_name: string | null;
  item_image: string | null;
  tools: unknown;
};

/** json_agg приходит массивом, а у моста бывает и строкой — читаем оба. */
function toolRows(v: unknown): ToolRow[] {
  if (Array.isArray(v)) return v as ToolRow[];
  if (typeof v !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as ToolRow[]) : [];
  } catch {
    return [];
  }
}

/** Ids списка шаблона: toolItemIds (если массив) и старый toolItemId. */
const TOOL_IDS_SQL = `(SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(d.meta->'interact'->'toolItemIds') = 'array'
           THEN d.meta->'interact'->'toolItemIds' ELSE '[]'::jsonb END))`;

const LIST_SQL = `SELECT d.id, d.name, d.meta->'interact' AS interact,
         ci.name AS item_name, ci.image AS item_image,
         (SELECT json_agg(json_build_object('id', ti.id, 'name', ti.name,
                                            'image', ti.image, 'wear', ti.tool_wear))
            FROM yuplink.raid_custom_item ti
           WHERE ti.id = d.meta->'interact'->>'toolItemId' OR ti.id IN ${TOOL_IDS_SQL}) AS tools
    FROM yuplink.mystic_item_template d
    LEFT JOIN yuplink.raid_custom_item ci ON ci.id = d.meta->'interact'->>'itemId'
   WHERE d.kind = 'decoration' AND COALESCE(d.active, true)
     AND d.meta->'interact'->>'on' = 'true';`;

/** Инструменты по порядку списка: только найденные в справочнике. */
async function toolViews(ids: readonly string[], raw: unknown): Promise<DecorToolView[]> {
  const byId = new Map(toolRows(raw).map((t) => [String(t.id ?? ""), t]));
  const out: DecorToolView[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t || t.name == null) continue;
    const name = String(t.name);
    out.push({
      id,
      name,
      image: typeof t.image === "string" ? t.image : null,
      wear: toolWearOf(t.wear),
      key: await canonStackKey("custom", id, name),
    });
  }
  return out;
}

/** Живой декор с включённым взаимодействием: id → настройка. */
export async function loadInteractiveDecor(): Promise<Record<string, DecorInteractView>> {
  if (cache && cache.expires > Date.now()) return cache.value;
  const rows = ((await mcpExec(LIST_SQL, { wrapJson: true }).catch(() => [])) ?? []) as Row[];
  const value: Record<string, DecorInteractView> = {};
  for (const r of rows) {
    const conf = parseDecorInteract(r.interact);
    // Товар удалили из справочника — выдавать нечего, взаимодействия нет.
    if (!conf || !r.item_name) continue;
    const tools = conf.toolItemIds ? await toolViews(conf.toolItemIds, r.tools) : [];
    // Инструменты заданы, но все удалены из справочника — даром рубить нельзя: выключено.
    if (conf.toolItemIds && tools.length === 0) continue;
    const first = tools[0];
    value[String(r.id)] = {
      ...conf,
      name: String(r.name ?? r.id),
      itemName: String(r.item_name),
      itemImage: r.item_image ?? null,
      hand: canChopByHand(conf.toolItemIds ?? []),
      ...(first
        ? {
            toolItemId: first.id,
            toolItemIds: tools.map((t) => t.id),
            tools,
            toolName: first.name,
            toolImage: first.image,
            toolWear: first.wear,
            toolKey: first.key,
          }
        : {}),
    };
  }
  cache = { expires: Date.now() + TTL_MS, value };
  return value;
}

export function dropInteractiveDecorCache(): void {
  cache = null;
}
