// Причал клетки → отметка для карты (getBetaRaidShips): сколько свободных, занятых,
// разбитых и подбитых, чей арт виден и запас хода видимого борта.
//
// Вынесено из ship-action.ts (лимит 250 строк) — заодно чистая функция без базы.
import { shipBroken, shipMaxHp } from "@/lib/shipHealth";
import type { ShipCell } from "./ship-berths";
import type { MyShip } from "./ship-crew";

export function shipMarkOf(c: ShipCell, account: string, my: MyShip | null) {
  const busy = Math.min(c.busy, c.ships);
  // Разрушено то, у чего кончился запас хода и на борту никого: пока капитан
  // не сошёл, судно ещё на ходу («дай доехать до берега»).
  const broken = c.fleet.filter((f) => shipBroken(f.hp, !!f.crew)).length;
  // Подбитые синим динамитом (dynamite-08) — тоже разбитые, но не чинятся, держат
  // клетку и через час исчезают. Срок клетки — по последнему взрыву.
  const blastedAt = c.fleet.reduce<number | null>(
    (at, f) => (f.blastedAt == null ? at : Math.max(at ?? 0, f.blastedAt)),
    null,
  );
  const mineShip = c.fleet.find((f) => f.crew === account) ?? null;
  const freeShips = c.fleet.filter((f) => !f.crew && f.hp > 0 && f.blastedAt == null);
  // Полоску рисуем по тому борту, чей арт виден: свой → свободный (самый
  // целый) → занятый → разрушенный.
  const shown =
    mineShip ??
    (c.water ? (freeShips.sort((a, b) => b.hp - a.hp)[0] ?? null) : null) ??
    c.fleet.find((f) => f.crew) ??
    c.fleet[0] ??
    null;
  return {
    q: c.q,
    r: c.r,
    total: c.ships,
    busy,
    // На суше свободных нет: сесть туда сервер не пустит, и обещать посадку
    // клиенту нельзя — он посчитал бы цену посадки, а списалась бы другая.
    // Разрушенные тоже не в счёт: на них не сядешь, пока не починят.
    free: c.water ? freeShips.length : 0,
    broken,
    blasted: c.fleet.filter((f) => f.blastedAt != null).length,
    blastedAt,
    // Своё судно — то, где записан аккаунт игрока.
    mine: c.crew.includes(account),
    // Большой корабль на клетке — карта рисует его отдельным артом.
    big: c.big,
    // Свободный ЦЕЛЫЙ большой — в него сядет посадка (seatOnShip берёт большой
    // первым). Только он открывает маршруту океан: занятый или разбитый
    // большой рядом с малым вёл игрока в океан на малом (жалоба 03.10).
    freeBig: c.water && freeShips.some((f) => f.kind === "big"),
    // МОЁ судно большое (для океана и цены гребка), а не «на клетке есть большой».
    mineBig: !!my && my.q === c.q && my.r === c.r && my.kind === "big",
    // Запас хода видимого борта — для полоски под кораблём.
    hp: shown?.hp ?? 0,
    hpMax: shipMaxHp(shown?.kind ?? "small"),
  };
}
