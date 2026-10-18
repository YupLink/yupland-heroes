// Наборы городов в мире (v4): набор спецификации (learn-kits) → постройки для
// роста города. По роли берутся свои облики набора, а общие — только если
// своих для роли нет: драконья лавка, а не склад «как у всех». Облик, которого
// в справочнике больше нет, пропускаем — постройка не встанет в чужой
// картинке. Набор без ратуши, без лавки или беднее RACE_MIN_ROLES служб в мир
// не идёт.
import { RACE_MIN_ROLES, type RaceTown } from "@/lib/raid/worldgen/collections";
import type { KitLook, TownKit } from "@/lib/raid/worldgen/spec";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import type { RoleOption, TownRole } from "@/lib/raid/zonegen/town/types";

type Skin = NonNullable<RoleOption["skins"]>[number];

/** По роли: свои облики набора, а нет своих — все. */
function preferOwn(
  looks: readonly KitLook[],
  roleOf: (t: string) => TownRole | undefined,
): KitLook[] {
  const byRole = new Map<TownRole, KitLook[]>();
  for (const l of looks) {
    const r = roleOf(l.t);
    if (r === undefined || r === "town_hall") continue;
    byRole.set(r, [...(byRole.get(r) ?? []), l]);
  }
  return [...byRole.values()].flatMap((list) =>
    list.some((l) => l.own) ? list.filter((l) => l.own) : list,
  );
}

/** Наборы → города для роста: ратуша в облике набора и его постройки по ролям. */
export function kitTowns(
  kits: readonly TownKit[],
  all: readonly BuildingOption[],
  options: readonly RoleOption[],
): RaceTown[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const skins = new Map<string, Skin>();
  for (const o of all) for (const s of o.skins ?? []) skins.set(s.id, s);
  const out: RaceTown[] = [];
  for (const kit of kits) {
    const hall = byId.get(kit.hall.t);
    const hallSkin = kit.hall.s === null ? null : (skins.get(kit.hall.s) ?? null);
    if (hall?.role !== "town_hall" || hall.effect !== "town_hall") continue;
    if (kit.hall.s !== null && hallSkin === null) continue;
    const byTpl = new Map<string, Skin[]>();
    for (const l of preferOwn(kit.looks, (t) => byId.get(t)?.role)) {
      const skin = l.s === null ? null : skins.get(l.s);
      if (skin === undefined) continue;
      const list = byTpl.get(l.t) ?? [];
      if (skin !== null && !list.some((x) => x.id === skin.id)) list.push(skin);
      byTpl.set(l.t, list);
    }
    const opts: RoleOption[] = [{ ...hall, skins: hallSkin ? [hallSkin] : [] }];
    for (const [t, list] of [...byTpl].sort(([a], [b]) => (a < b ? -1 : 1)))
      opts.push({ ...(byId.get(t) as RoleOption), skins: list });
    const roles = new Set(opts.filter((o) => o.role !== "town_hall").map((o) => o.role));
    const shop = opts.some((o) => o.role === "market" && o.effect === "market");
    if (roles.size < RACE_MIN_ROLES || !shop) continue;
    out.push({
      race: kit.race,
      options: opts,
      terrains: kit.terrains.map((t) => t.id),
      label: kit.label,
      sign: kit.sign,
    });
  }
  return out;
}
