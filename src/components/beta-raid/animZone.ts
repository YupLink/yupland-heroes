// Где на карте что-то шевелится (владелец, 09.11.2026): «на большом расстоянии —
// третий обзор, вне стандартных клеток — анимаций не должно быть, не грузи систему;
// как только подойду и здание попадёт во второй обзор — анимация пусть запускается».
//
// Второй обзор и ближе — свой радиус (visible), лёгкая плёнка вокруг героя (fogZones.
// active, 20 клеток, под биноклем 40) и подсветка своих шахт (bright). Всё дальше —
// тёмный туман: там первый кадр, без будильников кадра и без докачки листов анимации.
// Админ с открытой картой (revealAll) тумана не видит — у него как было.
import type { DrawScene } from "./betaCanvasScene";

export function animatesAt(scene: DrawScene, i: number): boolean {
  if (scene.revealAll || scene.visible.has(i)) return true;
  const z = scene.fogZones;
  return !!z && (z.active.has(i) || z.bright.has(i));
}
