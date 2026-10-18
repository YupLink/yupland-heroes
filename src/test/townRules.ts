// Проверка правил зонирования (docs/town-generation-algorithm.json, таблица
// zoning и метрики шага 15) на выходе placeTown — для прогона на живом
// справочнике. Возвращает список нарушений словами: пусто — всё выполнено.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import { hexDist, key, keyOf, neighborKeys, parseKey } from "@/lib/raid/zonegen/town/hex";
import { themeOfName } from "@/lib/raid/zonegen/town/theme";
import type { RoleOption, TownInput, TownResult, TownRole } from "@/lib/raid/zonegen/town/types";

type Spot = { q: number; r: number; role: TownRole };

const minTo = (c: ZoneCell, list: readonly ZoneCell[]): number =>
  list.reduce((m, x) => Math.min(m, hexDist(c, x)), Number.POSITIVE_INFINITY);

/** Нарушения правил размещения ролей; пустой список — всё по спецификации. */
export function zoningViolations(res: TownResult, input: TownInput): string[] {
  const sk = res.skeleton;
  if (sk === null) return ["нет скелета"];
  const out: string[] = [];
  const of = (role: TownRole): Spot[] => res.placed.filter((p) => p.role === role);
  const town = sk.form === "town" || sk.form === "port";
  const hall = of("town_hall")[0];
  const roads = new Set([...sk.roads.keys(), ...sk.plaza.map(keyOf), ...input.mapRoads]);
  const green = new Set(sk.green.map(keyOf));
  const edge = (c: ZoneCell) => sk.radius - hexDist(c, sk.center);

  if (hall !== undefined && keyOf(hall) !== keyOf(sk.center)) out.push("ратуша не в центре");
  if (town && hall === undefined) out.push("у городка нет ратуши");
  for (const p of sk.plaza)
    if (res.placed.some((x) => keyOf(x) === keyOf(p))) out.push("постройка на площади");
  for (const t of of("temple")) {
    if (hall !== undefined && hexDist(t, hall) !== 2)
      out.push(`храм не на dist 2 от ратуши (${hexDist(t, hall)})`);
    if (minTo(t, [...of("forge"), ...of("arena")]) < 3) out.push("храм ближе 3 к кузнице/арене");
  }
  const tav = of("tavern")[0];
  if (tav !== undefined && sk.gates.length > 0 && minTo(tav, sk.gates) > 2)
    out.push(`таверна №1 дальше 2 от ворот (${minTo(tav, sk.gates)})`);
  for (const w of of("warehouse")) {
    const wet = sk.form === "port" ? minTo(w, [...input.water].map(parseKey)) : Infinity;
    if (sk.gates.length > 0 && minTo(w, sk.gates) > 3 && wet > 1)
      out.push("склад не у въезда и не у воды");
  }
  for (const f of of("forge")) {
    if (town && edge(f) > 2) out.push(`кузница не у края (до кольца Rb ${edge(f)})`);
    const quiet = [...of("temple"), ...of("museum"), ...of("university")];
    if (minTo(f, town ? [...quiet, ...of("chambers")] : quiet) < 3)
      out.push("кузница ближе 3 к храму/музею/университету/покоям");
  }
  for (const b of of("barracks"))
    if (hall !== undefined && hexDist(b, hall) < 2) out.push("казарма у ратуши");
  for (const s of of("shipyard")) {
    const water = neighborKeys(keyOf(s)).filter((k) => input.water.has(k)).length;
    if (water < 2) out.push("верфь не у воды");
  }
  // Каждая постройка выходит на улицу, площадь или луг; второй ряд — ≤ 30 % домов.
  let second = 0;
  for (const p of res.placed) {
    const n = neighborKeys(keyOf(p));
    if (n.some((k) => roads.has(k) || green.has(k))) continue;
    if (p.role === "house") second++;
    else out.push(`${p.role} без выхода на улицу`);
  }
  const houses = of("house").length;
  if (second > Math.ceil(0.3 * houses)) out.push(`второй ряд ${second} из ${houses} домов`);
  // Одинаковые рынки не соприкасаются (watabou).
  const ids = new Map(
    res.structures.filter((s) => s.buildingId).map((s) => [key(s.q, s.r), s.buildingId]),
  );
  for (const p of of("market"))
    for (const k of neighborKeys(keyOf(p)))
      if (
        ids.get(k) === ids.get(keyOf(p)) &&
        res.placed.some((x) => keyOf(x) === k && x.role === "market")
      )
        out.push("два одинаковых рынка рядом");
  return out;
}

/**
 * Плотность к краю (закон Кларка): доля застроенной суши в ядре r ≤ Rb/3
 * против доли на внешнем кольце. [ядро, край].
 */
export function densityCoreEdge(res: TownResult, input: TownInput): [number, number] {
  const sk = res.skeleton;
  if (sk === null) return [0, 0];
  const built = new Set(res.placed.map(keyOf));
  const land = input.cells.filter((c) => !input.water.has(keyOf(c)));
  const share = (inRing: (d: number) => boolean) => {
    const ring = land.filter((c) => inRing(hexDist(c, sk.center)));
    return ring.length === 0 ? 0 : ring.filter((c) => built.has(keyOf(c))).length / ring.length;
  };
  return [share((d) => d <= sk.radius / 3 + 1), share((d) => d >= sk.radius - 1 && d <= sk.radius)];
}

/** Облики: все одной темы, облик — из групп своего шаблона, у кого есть облик темы — надет. */
export function skinViolations(res: TownResult, options: RoleOption[]): string[] {
  const out: string[] = [];
  const byId = new Map(options.map((o) => [o.id, o]));
  const theme = res.report.theme ?? null;
  for (const s of res.structures) {
    if (typeof s.buildingId !== "string") continue;
    const o = byId.get(s.buildingId);
    const skins = o?.skins ?? [];
    const own = skins.find((k) => k.id === s.buildingSkinId);
    if (s.buildingSkinId !== undefined && own === undefined) out.push(`чужой облик у ${o?.name}`);
    if (own !== undefined && themeOfName(own.name) !== theme)
      out.push(`облик ${own.name} не темы ${theme}`);
    const has = theme !== null && skins.some((k) => themeOfName(k.name) === theme);
    if (has && own === undefined) out.push(`${o?.name} без облика темы ${theme}`);
  }
  return out;
}
