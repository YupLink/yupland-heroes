// Редкость героя-товара на плитке витрины (владелец, 23.10.2026: «в покупке
// героя в ломбарде не видно редкости героя — хоть иконка какая-то в окошке
// должна быть»).
//
// Редкость героя — по ЯРУСУ шаблона (mystic_item_template.level), как у ломбарда
// и спящих (heroes-list-dormant.rarityOfTemplateLevel): колонка rarity у шаблонов
// героев пуста, и клиенту взять её неоткуда. Одним запросом на всю витрину, а не
// по позиции. Сбой базы — витрина без плашек, а не пустая лавка.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { rarityOfTemplateLevel } from "../heroes-list-dormant";
import { isHeroAny } from "./hero-any";
import type { HeroRarity } from "@/lib/heroLevels";

/** id шаблона героя → редкость. «Любой … герой» сюда не входит: редкость у него в имени. */
export async function heroRarities(
  goods: ReadonlyArray<{ kind: string; refId: string | null }>,
): Promise<Map<string, HeroRarity>> {
  const ids = [
    ...new Set(
      goods
        .filter((g) => g.kind === "hero" && !!g.refId && !isHeroAny(g.refId))
        .map((g) => g.refId as string),
    ),
  ];
  const out = new Map<string, HeroRarity>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(
    `SELECT id, level FROM yuplink.mystic_item_template
      WHERE kind = 'hero' AND id IN (${ids.map(sqlStr).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; level: number | null }>;
  for (const r of rows ?? []) out.set(String(r.id), rarityOfTemplateLevel(r.level));
  return out;
}
