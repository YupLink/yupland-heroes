// Что окно постройки показывает у СТОЛБА ЗАКЛИНАНИЙ: цена изучения и можно ли
// подойти. Сам каталог сюда не тянем — его отдаёт getSpellPillarOffer, когда
// игрок откроет столб. Так же устроены таверна и маркет: окно постройки не
// возит список ради одной строки «Изучить за 100 золота».
import { spellPillarConfig } from "./spell-pillar";
import type { BuildingExtra } from "@/lib/buildingEffect";

export function spellPillarExtra(opts: {
  built: boolean;
  meta?: unknown;
  cellConfig?: unknown;
}): BuildingExtra {
  const cfg = spellPillarConfig(opts.cellConfig, opts.meta);
  // Порядок отказов тот же, что у гарда самого столба (requirePillar): недострой
  // важнее ненастроенности, иначе кнопка гасла бы по одной причине, а сервер
  // отвечал бы другой.
  const reasonKey = !opts.built
    ? "spell.pillar_unbuilt"
    : !cfg || cfg.learnPrices.length === 0
      ? "spell.pillar_no_price"
      : null;
  return {
    kind: "spellbook",
    learnPrices: cfg?.learnPrices ?? [],
    forgetPrices: cfg?.forgetPrices ?? [],
    can: reasonKey === null,
    reasonKey,
  };
}
