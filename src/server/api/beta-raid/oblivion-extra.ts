// Что окно постройки «Забвение» показывает: цену, заряды и время и можно ли
// получить. Ходить в базу незачем — всё в настройке клетки (или шаблона).
import { checkCellOblivion, type OblivionExtra } from "@/lib/oblivionConfig";

export function oblivionExtra(opts: {
  built: boolean;
  meta?: unknown;
  cellConfig?: unknown;
}): OblivionExtra {
  const chk = checkCellOblivion(opts.cellConfig, opts.meta);
  const cfg = chk.ok ? chk.cfg : null;
  // Порядок отказов тот же, что у самой выдачи (oblivion-temple.ts): недострой
  // важнее ненастроенности, иначе кнопка гасла бы по одной причине, а сервер
  // отвечал бы другой.
  const reasonKey = !opts.built ? "oblivion.unbuilt" : !chk.ok ? chk.reasonKey : null;
  return {
    kind: "oblivion",
    prices: cfg?.prices ?? [],
    // Не настроено — окно подпишет просто «Забвение»: выдуманные «1 Lv» над
    // строкой отказа врали бы, что именно здесь продаётся.
    level: cfg?.level ?? "",
    minutes: cfg?.minutes ?? "",
    can: reasonKey === null,
    reasonKey,
  };
}
