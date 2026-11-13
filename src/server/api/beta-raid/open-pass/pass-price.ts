// Цена «Открыть» на карте игрока (остров новичка, владелец 20.10.2026): на
// острове все траты энергии в 10 раз меньше (island/energy). Цену мешочка и
// сундука собирает SQL (pass.aimOf), поэтому множитель — тоже в SQL, до сотых:
// ровно как scaleEnergy в окнах (bag-read, pchest-read, chest-net) — показанное
// совпадает со списанным. В мире цена уходит дословно, без обёртки.
import { energyMultOf } from "@/lib/raid/island/energy";

export function priceOnMapSql(priceSql: string, mapId: string): string {
  const m = energyMultOf(mapId);
  return m === 1 ? priceSql : `ROUND((${priceSql}) * ${m}, 2)`;
}
