// Что окно генератора артефактов (§8.122) узнаёт о постройке: цены по
// редкостям, цену уникальности и можно ли заказать. Всё — в настройке клетки
// (или шаблона); задания игрока окно берёт своей ручкой (getArtGenJobs).
import { artGenConfigOf, artGenOpen, type ArtGenExtra } from "@/lib/artGen/artGenConfig";

export function artGenExtra(opts: {
  built: boolean;
  meta?: unknown;
  cellConfig?: unknown;
}): ArtGenExtra {
  const cfg = artGenConfigOf(opts.cellConfig, opts.meta);
  // Порядок отказов — как у самого заказа (art-gen-order): недострой важнее.
  const reasonKey = !opts.built ? "artgen.unbuilt" : !artGenOpen(cfg) ? "artgen.not_set" : null;
  return {
    kind: "art_gen",
    prices: cfg.prices,
    unique: cfg.unique,
    can: reasonKey === null,
    reasonKey,
  };
}
