// Щипок «под пальцами» (владелец, 07.10.2026: «зум — карта дрожит, камеру
// отбрасывает»). Прежний щипок держит центр экрана и догоняет жест плавно:
// масштаб и сдвиг едут к цели порознь — картинка ходит, а оставшийся палец
// подхватывает недоехавшую камеру. Новый ставит камеру сразу и держит под
// пальцами ту точку карты, с которой начался жест.
//
// Пока только в замке (CastleGame включает на время своей жизни) — у игроков
// управление прежнее, пока замок не открыт всем.
let focal = false;

export function setFocalPinch(on: boolean): void {
  focal = on;
}

export function focalPinch(): boolean {
  return focal;
}

/** Где на экране окажется точка карты world при сдвиге off и масштабе s — и
 *  обратное: какой нужен сдвиг, чтобы world легла под палец (центр — W/2, H/2). */
export function offsetForAnchor(
  world: { x: number; y: number },
  finger: { x: number; y: number },
  s: number,
  W: number,
  H: number,
): { x: number; y: number } {
  return { x: finger.x - W / 2 - world.x * s, y: finger.y - H / 2 - world.y * s };
}

export function worldUnder(
  finger: { x: number; y: number },
  off: { x: number; y: number },
  s: number,
  W: number,
  H: number,
): { x: number; y: number } {
  return { x: (finger.x - W / 2 - off.x) / s, y: (finger.y - H / 2 - off.y) / s };
}
