// Шаг 3: форма поселения выводится из ограничений, а не выбирается.
//
// Спецификация (docs/town-generation-algorithm.json, шаг 3 и таблица forms):
// дерево решений по классификации немецких сельских форм (agrarraum.info) —
// лагерь, хутор (Weiler), порт, городок с площадью, а из деревень: уличная
// (Straßendorf), круглая (Rundling), луговая (Angerdorf), кучевая (Haufendorf).
// Форма меняет параметры следующих шагов (площадь, луг, петли), но сама улиц
// не рисует. Сид здесь не участвует вовсе: он влияет только через жребий
// числа въездов, когда дорог карты нет.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hexToXY } from "@/lib/raid/zonegen/noise";
import { inZone } from "@/lib/raid/zonegen/town/fields";
import { disk, hexDist, hexLine, keyOf, neighborKeys } from "@/lib/raid/zonegen/town/hex";
import type { TownFields, TownForm, TownRole } from "@/lib/raid/zonegen/town/types";
import type { TownKind } from "@/lib/raid/zonegen/settlement-types";

/** Что в составе — от этого зависят лагерь, хутор, порт и городок. */
export type TownComposition = {
  hall: boolean;
  temple: boolean;
  tavern: boolean;
  market?: boolean;
  barracks?: boolean;
  /** Есть ли жильё-двор; не задано — есть (жилья 55–60 % от N, шаг 1). */
  houses?: boolean;
  /** Порт требует верфь или склад; не задано — считаем, что будут (шаг 1). */
  warehouse?: boolean;
  shipyard?: boolean;
};

export function compositionOf(roles: Iterable<TownRole>): TownComposition {
  const has = new Set(roles);
  return {
    hall: has.has("town_hall"),
    temple: has.has("temple"),
    tavern: has.has("tavern"),
    market: has.has("market"),
    barracks: has.has("barracks"),
    houses: has.has("house") || has.has("chambers"),
    warehouse: has.has("warehouse"),
    shipyard: has.has("shipyard"),
  };
}

/** Кучевая: blocked > 20 % клеток в радиусе Rb (шаг 3). */
const BLOCKED_MAX = 0.2;
/**
 * Невыпуклость: доля пар клеток суши, прямая между которыми выходит с суши.
 * Порог наш (в спецификации числа нет): 10 % — это уже «залив» в круге, а не
 * пара деревьев, которые и так ловит BLOCKED_MAX.
 */
const NONCONVEX_SHARE = 0.1;
/** Вытянутость: главная ось длиннее поперечной в 1.5 раза (порог наш). */
const ELONGATED = 1.5;
/** Порт — у крупного водоёма: пруд меньше гекса радиуса 1 (7 клеток) — не гавань. */
const PORT_WATER_MIN = 7;

export type AreaFacts = {
  blockedShare: number;
  nonConvex: boolean;
  elongated: boolean;
  water: boolean;
};

function isNonConvex(land: readonly ZoneCell[]): boolean {
  const set = new Set(land.map(keyOf));
  let pairs = 0;
  let broken = 0;
  for (let i = 0; i < land.length; i++) {
    for (let j = i + 1; j < land.length; j++) {
      if (hexDist(land[i], land[j]) < 2) continue;
      pairs++;
      if (hexLine(land[i], land[j]).some((c) => !set.has(keyOf(c)))) broken++;
    }
  }
  return pairs > 0 && broken / pairs > NONCONVEX_SHARE;
}

/** Отношение осей облака суши вокруг центра (собственные числа ковариации). */
function isElongated(fields: TownFields, center: ZoneCell, radius: number): boolean {
  const pts = disk(center, 2 * radius)
    .filter((c) => fields.land.has(keyOf(c)))
    .map((c) => hexToXY(c.q, c.r));
  if (pts.length < 3) return false;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let a = 0;
  let b = 0;
  let c = 0;
  for (const p of pts) {
    a += (p.x - mx) ** 2;
    b += (p.x - mx) * (p.y - my);
    c += (p.y - my) ** 2;
  }
  const half = (a + c) / 2;
  const root = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  const lo = half - root;
  return lo <= 1e-9 || Math.sqrt((half + root) / lo) >= ELONGATED;
}

/** Касается ли круг Rb (с каймой в 1) воды, связанной в водоём ≥ 7 клеток. */
function touchesBigWater(fields: TownFields, center: ZoneCell, radius: number): boolean {
  const seen = new Set<string>();
  for (const c of disk(center, radius + 1)) {
    const k = keyOf(c);
    if (!fields.water.has(k) || seen.has(k)) continue;
    const queue = [k];
    seen.add(k);
    for (let i = 0; i < queue.length && queue.length < PORT_WATER_MIN; i++) {
      for (const n of neighborKeys(queue[i])) {
        if (!fields.water.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    if (queue.length >= PORT_WATER_MIN) return true;
  }
  return false;
}

/** Замеры области вокруг центра для дерева решений. */
export function measureArea(fields: TownFields, center: ZoneCell, radius: number): AreaFacts {
  const area = disk(center, radius).filter((c) => inZone(fields, keyOf(c)));
  const land = area.filter((c) => fields.land.has(keyOf(c)));
  return {
    blockedShare: area.length > 0 ? 1 - land.length / area.length : 1,
    nonConvex: isNonConvex(land),
    elongated: isElongated(fields, center, radius),
    water: touchesBigWater(fields, center, radius),
  };
}

export type FormFacts = AreaFacts & {
  n: number;
  comp: TownComposition;
  /** Въезды для решения: пересечения дорог карты с контуром, а без дорог — жребий. */
  entries: number;
  /** Есть пара въездов под углом ≥ 120° от центра. */
  opposite: boolean;
  /** Дорога карты проходит насквозь (входит и выходит, связна внутри круга). */
  through: boolean;
  /** Луг из 7 клеток (центр + кольцо 1) целиком на суше. */
  roundFits: boolean;
  /** Линза луга между двумя въездами влезает (≥ 4 клеток суши). */
  greenFits: boolean;
  /**
   * Явный заказ админа («Что строим»). Владелец, 25.09: заказал «городок» у
   * реки — вышел «порт» на 8 домов. Заказ побеждает вывод; «по месту» (auto)
   * — форма выводится, как в таблице форм.
   */
  kind?: TownKind;
};

/**
 * Дерево решений строго в порядке шага 3. Добавлено только то, что следует
 * из таблицы форм: у круглой деревни «область близка к кругу» (без
 * препятствий и заливов), а круглой, луговой и кучевой ратуша не положена —
 * деревня с ратушей становится городком, потому что ратуше нужна площадь.
 */
export function decideForm(f: FormFacts): TownForm {
  const kind = f.kind ?? "auto";
  if (kind === "town") return "town";
  if (kind === "port") return f.water ? "port" : "town";
  if (kind === "hamlet") return "hamlet";
  if (kind === "camp") return "camp";
  if (kind === "village") return villageForm(f);
  const { hall, temple, tavern } = f.comp;
  if (f.n <= 6 && (f.comp.barracks === true || f.comp.houses === false)) return "camp";
  if (f.n <= 8 && !hall && !temple && !tavern) return "hamlet";
  const harbor = f.comp.warehouse !== false || f.comp.shipyard !== false;
  if (f.water && f.n >= 12 && harbor) return "port";
  if (f.n > 20 || (hall && temple && f.comp.market === true)) return "town";
  if (hall) {
    const v = villageForm(f);
    return v === "cluster" ? "town" : v;
  }
  return villageForm(f);
}

/**
 * Деревенская ветка таблицы форм: уличная → круглая → луговая → кучевая.
 * Её же берёт заказ «деревня»: порт и городок деревне не положены.
 */
function villageForm(f: FormFacts): TownForm {
  const hall = f.comp.hall === true;
  const street = f.through || (f.entries === 2 && f.opposite && f.elongated);
  if (street && f.n >= 6) return "street";
  const rough = f.blockedShare > BLOCKED_MAX || f.nonConvex;
  if (!hall && f.entries === 1 && f.n >= 5 && !rough && f.roundFits) return "round";
  if (!hall && f.entries === 2 && f.opposite && f.n >= 10 && f.greenFits) return "green";
  // Сюда попадают и «rough», и всё, что не легло в план: у кучевой деревни
  // шаблона нет — чистый рост по интересу (таблица forms).
  return "cluster";
}
