// Заклинание «телепорт в замок» (teleport_town): домой — к ОСНОВНОМУ замку
// игрока и из ЛЮБОГО мира (владелец, 09–10.10.2026). Выбрал ратушу основной —
// к ней, не выбирал — к центральному замку главного мира. С другого этажа
// переносит в главный мир тем же путём, что портал между этажами: судно
// остаётся у входа, клиент по `map` перекачивает карту.
//
// Путь — тот же, что у портала (movePlayerThroughPortal): он ссаживает с судна
// и не оставляет игрока в воде без лодки. Судно за героем НЕ тащим: заклинание
// обещает перенести только героя, а не позвать корабль через всю карту.
import { publishRaid } from "../../raidLive";
import { raidOwner } from "./owner";
import { activeBetaMapId, myMapId, ownCell, type Cell } from "./encounter-where";
import { leaveShipBehind, movePlayerThroughPortal, portalShipContext } from "./portal-ship";
import { homePlace } from "./home-castle-core";
import { castleLanding } from "./castle-door";

export type TeleportHome =
  | { ok: true; moved: Cell; map: string | null }
  | { ok: false; reasonKey: string };

export async function teleportHome(wallet: string): Promise<TeleportHome> {
  const [current, main, account] = await Promise.all([
    myMapId(wallet),
    activeBetaMapId(),
    raidOwner(wallet),
  ]);
  // Основной замок живёт в главном мире — туда и переносим, где бы ни стоял.
  const target = await castleLanding(main, await homePlace(account, main));
  if (!target) return { ok: false, reasonKey: "spell.castle_busy" };
  const cross = current !== main;
  // Другой мир: судно с этажа не едет — остаётся у входа (как у портала).
  const ctx = cross
    ? { ship: null, exitWater: (await portalShipContext(wallet, main, target)).exitWater }
    : await portalShipContext(wallet, main, target);
  const before = cross ? null : await ownCell(wallet).catch(() => null);
  const leftShip = cross ? await leaveShipBehind(wallet) : false;
  const res = await movePlayerThroughPortal(wallet, main, target, ctx, { carryShip: false });
  if (!res.moved) return { ok: false, reasonKey: "spell.teleport_failed" };
  if (cross) {
    // На прежнем этаже точка исчезает, в главном мире появляется.
    publishRaid({ mapId: current, type: "moved" });
    publishRaid({ mapId: main, type: "moved" });
    if (leftShip) publishRaid({ mapId: current, type: "ships" });
  } else {
    publishRaid(
      before
        ? { mapId: main, type: "moved", from: { q: before.q, r: before.r }, to: target }
        : { mapId: main, type: "moved" },
    );
    // Судно тоже могло поехать (пришло за героем или осталось свободным).
    if (res.mode !== "none") publishRaid({ mapId: main, type: "ships" });
  }
  return { ok: true, moved: target, map: cross ? main : null };
}
