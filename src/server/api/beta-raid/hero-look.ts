// Кто ходит по карте: вид фигурки задаёт раса ВЫБРАННОГО героя.
//
// Выбранного нет (или он бесплатный, без расы) — на карте прежний рыцарь:
// он считается безрасовым. Сильнейший герой сам по себе фигурку не меняет —
// только осознанный выбор игрока.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";

/** Раса → файл в public/heroes. Латиница: имя не зависит от кодировки URL. */
export const RACE_SPRITE: Record<string, string> = {
  Кабан: "boar",
  Дракон: "dragon",
  Пчела: "bee",
  Единорог: "unicorn",
  ДраКошка: "dracat",
  Юпик: "yupik",
  // Старые названия — пока не все данные мигрированы.
  Кабаны: "boar",
  Драконы: "dragon",
  Пчелы: "bee",
  "Драконо кошки": "dracat",
};

/**
 * Раса → файл фигурки. Чистая часть heroSpriteFor: у кого герой уже загружен
 * (состояние рейда грузит его ради замка и обзора), тому за спрайтом второй
 * раз в базу ходить незачем.
 */
export function spriteForRace(race: string | null | undefined): string | null {
  return race ? (RACE_SPRITE[race] ?? null) : null;
}

export async function heroSpriteFor(wallet: string): Promise<string | null> {
  const list = sqlStr(await raidOwner(wallet));
  const rows = (await mcpExec(
    `SELECT t.race
       FROM yuplink.hero_instance h
       JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.account_id IN (${list}) AND h.selected_at IS NOT NULL
      ORDER BY h.selected_at DESC
      LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ race: string | null }>;
  return spriteForRace(rows?.[0]?.race ?? null);
}
