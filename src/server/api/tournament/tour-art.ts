// Артефакт по редкости в призах турнира (владелец, 04.10.2026: «1 место — лег,
// 2–3 — эпик, 4–10 — рар, 11–20 — коммон»): приз art с refId 'rarity:<…>'
// превращается в конкретный активный артефакт этой редкости перед подарком.
//
// Выбор детерминированный — по ключу подарка (md5(ключ || id шаблона)): повтор
// финиша выберет тот же артефакт, и ключ повтора подарка его не задвоит.
// Артефактов такой редкости нет — приз пропускаем с предупреждением в лог
// (выдать нечего), остальные призы места уходят как обычно.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { droppable, notMount } from "../craft/crafted-sql";
import { artRarityOf } from "@/lib/tournament/prizeText";
import type { NewGift } from "../gifts-create";

type Pick = { ref: string; id: string; name: string; image: string | null };

export function pickArtSql(list: ReadonlyArray<{ ref: string; rarity: string }>): string {
  const values = list.map((x) => `(${sqlStr(x.ref)}, ${sqlStr(x.rarity)})`).join(", ");
  return `SELECT v.ref, a.id, a.name, a.image_url AS image
  FROM (VALUES ${values}) v(ref, rarity)
  CROSS JOIN LATERAL (
    SELECT t.id, t.name, t.image_url FROM yuplink.mystic_item_template t
     WHERE t.kind = 'artifact' AND t.active AND t.rarity = v.rarity AND ${droppable("t")} AND ${notMount("t")}
     ORDER BY md5(v.ref || t.id) LIMIT 1
  ) a`;
}

/** Подарки с артефактом по редкости → конкретный артефакт; остальные как есть. */
export async function resolveArtRarity(gifts: NewGift[]): Promise<NewGift[]> {
  const need = gifts
    .map((g) => ({ g, rarity: g.kind === "art" ? artRarityOf(g.refId) : null }))
    .filter((x): x is { g: NewGift; rarity: string } => !!x.rarity && !!x.g.sourceRef);
  if (!need.length) return gifts;
  const rows = ((await mcpExec(
    pickArtSql(need.map((x) => ({ ref: String(x.g.sourceRef), rarity: x.rarity }))),
    { wrapJson: true },
  )) ?? []) as Pick[];
  const byRef = new Map(rows.map((r) => [r.ref, r]));
  const out: NewGift[] = [];
  for (const g of gifts) {
    if (g.kind !== "art" || !artRarityOf(g.refId)) {
      out.push(g);
      continue;
    }
    const pick = byRef.get(String(g.sourceRef));
    if (!pick) {
      console.warn("[tour] нет активного артефакта редкости для приза:", g.refId, g.sourceRef);
      continue;
    }
    out.push({
      ...g,
      refId: pick.id,
      title: g.title ? `${g.title}: ${pick.name}` : pick.name,
      image: pick.image ?? g.image,
    });
  }
  return out;
}
