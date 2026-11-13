// Комплекты одежды: сохранить раскладку артефактов и надевать её одним тапом.
//
// Жалоба игрока (11.09): «оочень надоедает постоянно менять комплекты вручную,
// очень много времени трачу». Боевой набор, добычный и торговый собираются из
// одних и тех же предметов — руками это десятки тапов по слотам.
//
// Комплект — СНИМОК мест («Карманы#2» → id предмета) на АККАУНТЕ: артефакты
// общие, а надевается набор на того героя, который выбран сейчас.
//
// Снимок может протухнуть: предмет продали, сожгли или надели на другого
// героя. Поэтому применение — не «всё или ничего»: надеваем что нашлось, а про
// остальное честно говорим числом.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { accountOf } from "./user-shared";
import { heroPowerEnabled, invalidateHeroPower } from "./beta-raid/hero-power";
import { loadSelectedHero } from "./beta-raid/hero-load";
import { writeEquipped } from "./heroes-gear-read";
import { buildEquipped, unequipFromOthers } from "./heroes-gear-presets-equip";
import { preferFreeCopies } from "./heroes-gear-copies";
import { artBrokenOn } from "./art-repair/art-repair-gate";
import { heroSlots, isKnownSlotType, parseHeroSlotKey } from "@/lib/hero/heroSlots";

const MAX_PRESETS = 12; // больше дюжины наборов — это уже не память, а свалка

export type GearPreset = {
  id: string;
  name: string;
  /** Сколько предметов в снимке. */
  total: number;
  /** Сколько из них ещё у игрока — по остальным комплект «просел». */
  have: number;
  /** Картинки первых предметов — чтобы чип узнавался глазами. */
  images: string[];
};

const newId = () => `gp_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

/** Снимок мест из строки БД: только знакомые слоты и непустые id. */
function parseSlots(raw: unknown): Record<string, string> {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(o)) {
    const id = String(value ?? "").trim();
    if (id && isKnownSlotType(parseHeroSlotKey(key).slot)) out[key] = id;
  }
  return out;
}

/** Какие из этих предметов ещё у игрока — с картинками для превью. */
async function ownedOf(account: string, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(
    `SELECT u.id, t.image_url AS "imageUrl"
       FROM yuplink.user_game_item u
       LEFT JOIN yuplink.mystic_item_template t ON t.id = u.template_id
      WHERE u.account_id = ${sqlStr(account)} AND u.id IN (${ids.map(sqlStr).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; imageUrl: string | null }>;
  for (const r of rows ?? []) out.set(String(r.id), r.imageUrl ?? null);
  return out;
}

export const listGearPresets = createServerFn({ method: "GET" }).handler(
  async (): Promise<GearPreset[]> => {
    const wallet = requireWallet();
    if (!(await heroPowerEnabled(wallet))) return [];
    const account = await accountOf(wallet);
    const rows = (await mcpExec(
      `SELECT id, name, slots FROM yuplink.hero_gear_preset
        WHERE account_id = ${sqlStr(account)} ORDER BY updated_at DESC;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; name: string; slots: unknown }>;

    const parsed = (rows ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      slots: parseSlots(r.slots),
    }));
    // Один запрос на все комплекты: у коллекционера их дюжина, и ходить в базу
    // за каждым — тот же перебор, что уже жёг время на экране снаряжения.
    const owned = await ownedOf(account, [
      ...new Set(parsed.flatMap((p) => Object.values(p.slots))),
    ]);

    return parsed.map((p) => {
      const ids = Object.values(p.slots);
      const mine = ids.filter((id) => owned.has(id));
      return {
        id: p.id,
        name: p.name,
        total: ids.length,
        have: mine.length,
        images: mine
          .map((id) => owned.get(id) ?? null)
          .filter((u): u is string => !!u)
          .slice(0, 4),
      };
    });
  },
);

/** Сохранить ТЕКУЩУЮ экипировку выбранного героя под именем. */
export const saveGearPreset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().min(1).max(40), id: z.string().min(1).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    if (!(await heroPowerEnabled(wallet))) throw new Error("Снаряжение героя пока недоступно");
    const hero = await loadSelectedHero(wallet);
    if (!hero) throw new Error("Сначала выбери основного героя");
    const account = await accountOf(wallet);
    const name = data.name.trim();
    const slots = parseSlots(hero.equipped);
    if (Object.keys(slots).length === 0) throw new Error("На герое ничего не надето");

    if (data.id) {
      await mcpExec(
        `UPDATE yuplink.hero_gear_preset
            SET name = ${sqlStr(name)}, slots = ${sqlStr(JSON.stringify(slots))}::jsonb,
                updated_at = now()
          WHERE id = ${sqlStr(data.id)} AND account_id = ${sqlStr(account)};`,
      );
      return { ok: true as const, id: data.id, name, total: Object.keys(slots).length };
    }

    const countRows = (await mcpExec(
      `SELECT count(*)::int AS n FROM yuplink.hero_gear_preset
        WHERE account_id = ${sqlStr(account)};`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ n: number }>;
    if (Number(countRows?.[0]?.n ?? 0) >= MAX_PRESETS) {
      throw new Error(`Комплектов уже ${MAX_PRESETS} — удали лишний`);
    }

    // Имя занято — перезаписываем тот комплект, а не плодим близнецов «Бой».
    const id = newId();
    const saved = (await mcpExec(
      `INSERT INTO yuplink.hero_gear_preset (id, account_id, name, slots)
       VALUES (${sqlStr(id)}, ${sqlStr(account)}, ${sqlStr(name)},
               ${sqlStr(JSON.stringify(slots))}::jsonb)
       ON CONFLICT (account_id, lower(name)) DO UPDATE
         SET slots = EXCLUDED.slots, name = EXCLUDED.name, updated_at = now()
       RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    return {
      ok: true as const,
      id: String(saved?.[0]?.id ?? id),
      name,
      total: Object.keys(slots).length,
    };
  });

export const renameGearPreset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1), name: z.string().min(1).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const account = await accountOf(wallet);
    await mcpExec(
      `UPDATE yuplink.hero_gear_preset SET name = ${sqlStr(data.name.trim())}, updated_at = now()
        WHERE id = ${sqlStr(data.id)} AND account_id = ${sqlStr(account)};`,
    );
    return { ok: true as const };
  });

export const deleteGearPreset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const account = await accountOf(wallet);
    await mcpExec(
      `DELETE FROM yuplink.hero_gear_preset
        WHERE id = ${sqlStr(data.id)} AND account_id = ${sqlStr(account)};`,
    );
    return { ok: true as const };
  });

/** Надеть комплект на выбранного героя. Чего нет — пропускаем, а не падаем. */
export const applyGearPreset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    if (!(await heroPowerEnabled(wallet))) throw new Error("Снаряжение героя пока недоступно");
    const hero = await loadSelectedHero(wallet);
    if (!hero) throw new Error("Сначала выбери основного героя");
    const account = await accountOf(wallet);

    const rows = (await mcpExec(
      `SELECT name, slots FROM yuplink.hero_gear_preset
        WHERE id = ${sqlStr(data.id)} AND account_id = ${sqlStr(account)} LIMIT 1;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ name: string; slots: unknown }>;
    const row = rows?.[0];
    if (!row) throw new Error("Комплект не найден");

    // Сломанное при запущенной механике не надевается (§8.63 п.3) — в broken.
    const on = await artBrokenOn(wallet);
    const built = await buildEquipped(account, hero.rarity, parseSlots(row.slots), on, hero.equipped);
    const { applied, missing, skipped, broken } = built;

    // Предмет мог остаться надетым на другом герое — снимаем там, иначе один
    // экземпляр числился бы в двух местах сразу. Ошибку глотать нельзя:
    // «полу-применённый» комплект даёт тот самый «дебафф после смены».
    // Снимок держит конкретные экземпляры; занятые другими героями меняем на
    // свободные копии, если они есть (владелец 29.09).
    const equip = await preferFreeCopies(account, hero.heroId, applied);
    await unequipFromOthers(account, hero.heroId, Object.values(equip));
    await writeEquipped(hero.heroId, equip);
    invalidateHeroPower(wallet);

    // Синхронно догоняем два кэша, чтобы первый удар после apply уже считал
    // по новым числам (жалоба Oleg Repin: «дебафф на смену — надо ждать /
    // рестартить»):
    //   1. loadHeroView оседает в свежем SWR-кэше heroPower.
    //   2. syncHeroEnergy кладёт новые hero_max_bonus/hero_regen_pct в
    //      user_energy, чтобы регенерация тикала по свежему интеллекту
    //      («энергия не пошла копиться после смены»). Без этого регенерация
    //      только на следующем move-hero-state.
    const { loadHeroView } = await import("./beta-raid/hero-power");
    const { syncHeroEnergy } = await import("./beta-raid/hero-energy-sync");
    const view = await loadHeroView(wallet).catch(() => null);
    if (view?.info?.field) {
      await syncHeroEnergy(wallet, view.info.field).catch(() => {});
    }

    const { loadMyHeroGear } = await import("./heroes-gear");
    const gear = await loadMyHeroGear(wallet).catch(() => null);

    return {
      ok: true as const,
      name: String(row.name ?? ""),
      equipped: Object.keys(equip).length,
      /** Сколько предметов из снимка не нашлось у игрока. */
      missing,
      /** Сколько не влезло: у этого героя таких мест нет (редкость ниже). */
      skipped,
      broken, // сломаны — не надеты, «почини в кузнице»
      /** Свежие слоты+статы для мгновенной подстановки в ["my-hero-gear"]. */
      gear,
    };
  });
