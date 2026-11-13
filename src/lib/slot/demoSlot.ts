// Холостая игра гостя (владелец, 28.10.2026: «нужно дать возможность покрутить
// вхолостую»): не вошёл — золота нет, автомат крутится в браузере тем же ходом
// serverStep на игрушечные 1000 кредитов, как в прототипе (5da11bfd, DEMO_START).
// На сервер ничего не уходит и ничего не начисляется; вошёл — автомат
// перечитывается уже на золото (loadSlot). Код грузится только гостю.
//
// Отдача — та же мягкая тяга, что у игры на золото (reelLevel: раз в 20 спинов цель
// по отдаче игрока и его манере удвоения), только цель 105 % вместо 90 % (владелец,
// 28.10.2026: «тут тоже умную сделай, но на 105 % только»). Цель — с первого спина.
import { cryptoRng, serverStep, SlotRefused, type ClientAction } from "./serverStep";
import { initialSlotState, type SlotState } from "./state";
import { publicView } from "./publicView";
import type { SlotView } from "@/server/api/slot/slot-api";

export const DEMO_START = 1000;
/** Цель отдачи холостой игры. */
export const DEMO_TARGET = 1.05;

export type DemoSlot = { view: () => SlotView; act: (a: ClientAction) => SlotView };

export function demoSlot(start = DEMO_START): DemoSlot {
  // Полное состояние (с тем, что под кучками) — только здесь; экрану — как с сервера.
  let full: SlotState = initialSlotState(start);
  let version = 0;
  const view = (): SlotView => ({ state: publicView(full), gold: full.balance, version });
  return {
    view,
    act(a) {
      try {
        full = serverStep(full, a, cryptoRng(), DEMO_TARGET);
      } catch (e) {
        throw e instanceof SlotRefused ? new Error(e.message) : e;
      }
      version += 1;
      return view();
    },
  };
}
