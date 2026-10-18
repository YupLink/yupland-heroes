// Где лежит черновик режима бога и почему он переживает F5.
//
// Кэш карты ["beta-raid-map"] персистится в localStorage (lib/query.ts): после
// перезагрузки карта рисуется мгновенно — вместе с невыгруженными мазками.
// Очередь же жила в памяти хука, и черновик выглядел сохранённым: счётчик
// «Выгрузить» пуст, отменить нечем, а на карте стоит то, чего нет на сервере.
//
// Выкинуть карту из персиста нельзя — это 274 КБ и мгновенная отрисовка для
// ВСЕХ игроков ради админской правки. Поэтому черновик переживает перезагрузку
// ВМЕСТЕ с картой: очередь и снимки «как было» пишутся ключом-соседом и живут
// те же сутки, что и персист react-query. Карта при этом помечается списком
// черновых клеток (draftCells) — по метке видно, что кэшу нельзя верить, если
// черновик всё-таки потерялся (приватный режим, переполнение, чужая вкладка).
//
// Ключ у КАЖДОЙ ВКЛАДКИ свой. Общий ключ переписывался целиком, и последняя
// запись молча съедала чужую работу: красишь в двух вкладках — правки первой
// исчезают без единого слова. Метка вкладки лежит в sessionStorage: она
// переживает перезагрузку (черновик тоже) и не делится с соседкой.
import type { AssetSnapshots } from "./cellAssets";
import type { CellDetails, CellPatch, DraftState } from "./patchMapCache";

const PREFIX = "gd-raid-admin-draft-v1";
/** Метка вкладки: у sessionStorage своя копия в каждой вкладке. */
const TAB_KEY = "gd-raid-admin-draft-tab";
/** Столько же живёт персист react-query — черновик не должен пережить карту. */
const TTL = 24 * 60 * 60_000;

export const draft = {
  queue: {} as Record<string, CellPatch>,
  base: {} as Record<string, CellDetails>,
  /** С какой карты снят черновик: активную карту рейда могли и сменить. */
  mapId: null as string | null,
  /**
   * Ассеты правок — снимками с палитры (см. cellAssets). Едут ВМЕСТЕ с
   * очередью: кэш палитры выбрасывается сменой buster'а персиста, а этот ключ
   * выкат переживает — иначе поднятый черновик рисует безымянную пустоту.
   */
  assets: {} as AssetSnapshots,
  loaded: false,
  /** Сколько правок подняли из localStorage — об этом стоит сказать один раз. */
  restored: 0,
};

let myKey: string | null = null;

/** Ключ этой вкладки. Без sessionStorage (приватный режим) — общий, как раньше. */
function storageKey(): string {
  if (myKey) return myKey;
  let tab = "";
  try {
    tab = window.sessionStorage.getItem(TAB_KEY) ?? "";
    if (!tab) {
      // crypto.randomUUID есть не во всяком вебвью (Telegram на Xiaomi 13T) —
      // берём то, что есть везде: метка должна быть уникальной в браузере,
      // криптостойкой ей быть незачем.
      tab = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem(TAB_KEY, tab);
    }
  } catch {
    // Вкладка осталась безымянной — ведём себя как одна-единственная.
  }
  myKey = tab ? `${PREFIX}:${tab}` : PREFIX;
  return myKey;
}

/** Время записи из сырой строки: savedAt пишем первым полем — парсить всё лишнее. */
const savedAtOf = (raw: string): number => Number(/"savedAt":(\d+)/.exec(raw.slice(0, 64))?.[1]);

/** Прибрать за закрытыми вкладками: их ключи иначе копятся до конца времён. */
function sweep(mine: string): void {
  const ls = window.localStorage;
  for (let i = ls.length - 1; i >= 0; i--) {
    const k = ls.key(i);
    // Общий ключ прежних версий не трогаем: его забирает себе loadDraft.
    if (!k || k === mine || k === PREFIX || !k.startsWith(`${PREFIX}:`)) continue;
    const raw = ls.getItem(k);
    if (!raw || Date.now() - (savedAtOf(raw) || 0) > TTL) ls.removeItem(k);
  }
}

/** Черновик этой вкладки, а если его нет — наследство общего ключа старых версий. */
function readRaw(mine: string): string | null {
  const own = window.localStorage.getItem(mine);
  if (own || mine === PREFIX) return own;
  // Забираем себе И УБИРАЕМ: иначе соседняя вкладка подняла бы ту же работу
  // второй раз, и один мазок стал бы двумя черновиками.
  const legacy = window.localStorage.getItem(PREFIX);
  if (legacy) window.localStorage.removeItem(PREFIX);
  return legacy;
}

export function loadDraft(): void {
  if (draft.loaded) return;
  draft.loaded = true;
  if (typeof window === "undefined") return;
  try {
    const mine = storageKey();
    sweep(mine);
    const raw = readRaw(mine);
    if (!raw) return;
    const d = JSON.parse(raw) as Partial<DraftState> & {
      savedAt?: number;
      mapId?: string | null;
      assets?: AssetSnapshots;
    };
    if (!d.queue || Date.now() - (d.savedAt ?? 0) > TTL) {
      window.localStorage.removeItem(mine);
      return;
    }
    draft.queue = d.queue;
    draft.base = d.base ?? {};
    draft.mapId = d.mapId ?? null;
    draft.assets = d.assets ?? {};
    draft.restored = Object.keys(draft.queue).length;
  } catch {
    // Битый или недоступный localStorage — черновика просто нет.
  }
}

/** Текущий черновик. Первое обращение поднимает его из localStorage. */
export function readDraft(): DraftState {
  loadDraft();
  return { queue: draft.queue, base: draft.base };
}

/** С какой карты сняты накопленные правки — с ней их и сверяет сервер. */
export function readDraftMapId(): string | null {
  loadDraft();
  return draft.mapId;
}

/** Снимки ассетов черновика: имя, картинка, цена шага, туман, число тиров. */
export function readDraftAssets(): AssetSnapshots {
  loadDraft();
  return draft.assets;
}

/** Заменить снимки целиком: их состав считается по очереди, а не копится. */
export function writeDraftAssets(next: AssetSnapshots): void {
  loadDraft();
  draft.assets = next;
}

/** Сколько правок восстановлено — считывается один раз за загрузку страницы. */
export function takeRestored(): number {
  loadDraft();
  const n = draft.restored;
  draft.restored = 0;
  return n;
}

/**
 * Записать черновик. `mapId` — КАНДИДАТ в метку карты: она ставится один раз,
 * на первой правке, и дальше не трогается никем.
 *
 * Раньше сюда на каждую запись приезжала карта, которая в кэше СЕЙЧАС, и метка
 * молча переезжала на активную: бета-карту переключали, черновик пересохранялся
 * на любом чужом обновлении — и сорок правок, собранных для карты A, уходили на
 * сменившую её B. Серверная сверка при этом молчала (B===B), а правки ложились
 * по тем же координатам поверх чужой местности и чужих построек.
 *
 * Метка живёт ВМЕСТЕ с очередью: опустела очередь — метка гаснет, и следующая
 * правка ставит новую. Считаем её в памяти даже без localStorage (приватный
 * режим, переполнение): проверка «черновик с другой карты» не должна зависеть
 * от того, доступно ли хранилище.
 */
export function saveDraft(mapId?: string | null): void {
  const empty = Object.keys(draft.queue).length === 0;
  // Очередь пуста — снимки не нужны никому: без правок дописывать в словари
  // карты нечего, а мёртвый снимок пережил бы своё хранилище.
  if (empty) draft.assets = {};
  if (empty) draft.mapId = null;
  else draft.mapId ??= mapId ?? null;
  if (typeof window === "undefined") return;
  try {
    if (empty) {
      window.localStorage.removeItem(storageKey());
      return;
    }
    const body = {
      savedAt: Date.now(),
      mapId: draft.mapId,
      queue: draft.queue,
      base: draft.base,
      assets: draft.assets,
    };
    window.localStorage.setItem(storageKey(), JSON.stringify(body));
  } catch {
    // Не записалось — карта в кэше останется помеченной, и при следующем
    // заходе её перечитают с сервера. Черновик потеряется, но врать не станет.
  }
}
