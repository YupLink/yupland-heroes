// Кто ДРУГОЙ где стоит на карте бета-рейда.
//
// Наружу отдаём только клетку и число игроков — без кошельков и имён: карту
// видят все участники, и знать «кто именно» им незачем.
// Считаем по аккаунтам: игрок — это аккаунт, сколько бы адресов он ни
// подключил, поэтому толпой из самого себя он больше не выглядит.
//
// Себя в список НЕ кладём: своя фигурка и так на карте, а список приходит с
// задержкой — на каждом шаге за игроком тянулся шлейф собственных лагерей по
// уже пройденным клеткам (и по воде тоже). Вычитаем себя по аккаунту из ТОГО ЖЕ
// снимка, что дал счёт (players-self): по «текущей клетке» шлейф возвращался.
import { createServerFn } from "@tanstack/react-start";
import { raidOwner } from "./owner";
import { requireBetaRaid } from "./gate";
import { playerMapId } from "./encounter-where";
import { sharedPlayers } from "./players-cache";
import { subtractSelf } from "./players-self";
import { loadVoidCells } from "./voidCells";
import { canIgnoreVoid } from "./voidGate";
import { markSeen } from "../account-seen";
import { markOnline } from "../raid-presence";

/** count — все игроки клетки, online — из них сейчас в игре (09.11). */
export type PlayerCell = { q: number; r: number; count: number; online: number };

export const getBetaRaidPlayers = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  // Своя метка на карте не показывается — игрок и так знает, где стоит.
  const account = await raidOwner(wallet);
  // Опрос идёт раз в минуту, пока игрок на карте: он здесь — его лагерь виден.
  markSeen(account);
  // И «онлайн сейчас» — для анимации лагеря и счёта «онлайн/офлайн» у соседей (09.11).
  markOnline(account);
  // Карта ИГРОКА (мультикарта): видим только соседей по СВОЕЙ карте.
  const mapId = await playerMapId(account);
  // Зону глухого тумана вычёркиваем из ответа целиком: и чужие метки, и
  // «здесь уже опустошено». Иначе игрок, который зону не видит и войти в неё
  // не может, читал бы её содержимое прямо из JSON. Минутный кэш тут уместен —
  // это показ, а не проходимость (см. voidCells.ts).
  const hidden = canIgnoreVoid(wallet) ? new Set<string>() : await loadVoidCells(mapId);

  // Раскладка по карте общая для всех — из кэша на 2 с (players-cache):
  // под нагрузкой 1000 игроков этот GROUP BY был самым тяжёлым запросом к
  // базе (108 в секунду, по секунде каждый). Себя вычитаем там, где нас видел
  // сам снимок (shared.at), — не по текущей клетке: снимок старше шага, и по
  // текущей в пройденной клетке оставался свой лагерь («тень», 20.09).
  const shared = await sharedPlayers(mapId);
  const cells: PlayerCell[] = subtractSelf(shared.cells, shared.at, account, shared.online).filter(
    (c) => !hidden.has(`${c.q},${c.r}`),
  );

  // Что уже опустошено. Карта кэшируется на пять минут, и без этого списка
  // игрок видел монетку, которую сосед забрал минуту назад: шёл к ней, тратил
  // энергию и получал «тайник опустошён».
  //
  // Слоёв на клетке два (runners.ts), и добытыми они гаснут по отдельности:
  // сундук забрали, а спрятавшийся под ним гриб жив и ждёт своей очереди.
  // Поэтому и списка два — какой из них про эту клетку, клиент знает по
  // признаку беглеца в самой карте (packed.runners).
  const deadRows = shared.dead;
  const deadKeys = (layer: number) =>
    (deadRows ?? [])
      .filter((row) => Number(row.cycle_no) === layer)
      .map((row) => `${Number(row.q)},${Number(row.r)}`)
      .filter((key) => !hidden.has(key));

  return {
    cells,
    /** Клетки, где объект САМОЙ КЛЕТКИ уже забран/повержен. */
    defeated: deadKeys(0),
    /** Клетки, где повержен спрятавшийся беглец. */
    defeatedRunners: deadKeys(1),
    /** Убитые/собранные объекты клетки, у которых прошло >5с — их пора убрать с
     *  карты совсем (клиент снимает объект, не рисует). Разгружает карту. */
    expired: (deadRows ?? [])
      .filter((row) => Number(row.cycle_no) === 0 && row.expired === true)
      .map((row) => `${Number(row.q)},${Number(row.r)}`)
      .filter((key) => !hidden.has(key)),
  };
});
