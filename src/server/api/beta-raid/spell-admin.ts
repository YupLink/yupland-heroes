// АДМИН: каталог заклинаний (yuplink.raid_spell). Завести, поправить, выключить.
//
// Удаления здесь нет намеренно: на шаблон ссылаются книги героев и откаты
// (FK ... ON DELETE RESTRICT), и удаление либо упало бы, либо — сними мы
// защиту — молча выкосило бы выученное у сотен игроков. Убрать заклинание из
// игры = снять галочку «в игре»: из витрины столба и из книги оно исчезает,
// но выученное остаётся строкой и не теряет места.
//
// Запись — ОДНИМ оператором (INSERT ... ON CONFLICT DO UPDATE): создание и
// правка отличаются только тем, был ли id. Слепой повтор моста шлёт тот же id
// и те же значения — второй раз пишется ровно то же самое.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireAdmin } from "../../auth";
import { loadSpellTemplates, SPELL_KINDS, type SpellTpl } from "./spell-tpl";
import { parseBoostEffects } from "@/lib/hero/boost";
import { oblivionEffectsOk, oblivionGuard } from "@/lib/hero/oblivionRule";

// id генерим тем же способом, что маркет (market-template.newId): без внешней
// зависимости и без похода в базу за sequence.
const newSpellId = () =>
  `spell_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/** Весь каталог, включая выключенные: админ правит и то, что убрано из игры. */
export const adminListSpells = createServerFn({ method: "GET" }).handler(
  async (): Promise<SpellTpl[]> => {
    requireAdmin();
    return loadSpellTemplates({ activeOnly: false });
  },
);

const effectInput = z.object({
  stat: z.string().max(20),
  value: z.string().max(20),
  minutes: z.string().max(20),
  /** Только у иммунитета: вид дебаффа или "all" (без поля zod его бы срезал). */
  ability: z.string().max(40).optional(),
});

const spellInput = (d: unknown) =>
  z
    .object({
      /** Пусто — заводим новое заклинание, id придумает сервер. */
      id: z.string().min(1).max(120).nullable().optional(),
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000).default(""),
      image: z.string().max(500).nullable().default(null),
      // «Забвение» с неверной парой «уровень + минуты» не сохраняем: разбор ниже
      // молча выкинул бы его, а админ думал бы, что сохранил (oblivionRule.ts).
      effects: z.array(effectInput).max(20).default([]).refine(oblivionGuard(oblivionEffectsOk)),
      energyCost: z.number().int().min(0).max(100_000),
      cooldownMinutes: z.number().int().min(0).max(100_000),
      minInt: z.number().int().min(0).max(1_000),
      kind: z.enum(SPELL_KINDS),
      active: z.boolean().default(true),
    })
    .parse(d);

/** Завести или поправить заклинание. Возвращает готовый шаблон — как читает игра. */
export const adminSaveSpell = createServerFn({ method: "POST" })
  .inputValidator(spellInput)
  .handler(async ({ data }): Promise<{ ok: true; spell: SpellTpl }> => {
    requireAdmin();
    const id = data.id?.trim() || newSpellId();
    // Эффекты чистим ТЕМ ЖЕ разбором, что читает игра: мусорная характеристика
    // или нулевой диапазон не должны доехать до боя.
    const effects = parseBoostEffects(data.effects);
    const image = data.image?.trim() || null;
    await mcpExec(
      `INSERT INTO yuplink.raid_spell
         (id, name, description, image, effects, energy_cost, cooldown_min,
          req_int, kind, active, created_at, updated_at)
       VALUES (${sqlStr(id)}, ${sqlStr(data.name)}, ${sqlStr(data.description)},
               ${image ? sqlStr(image) : "NULL"},
               ${sqlStr(JSON.stringify(effects))}::jsonb,
               ${data.energyCost}, ${data.cooldownMinutes}, ${data.minInt},
               ${sqlStr(data.kind)}, ${data.active}, now(), now())
       ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              image = EXCLUDED.image,
              effects = EXCLUDED.effects,
              energy_cost = EXCLUDED.energy_cost,
              cooldown_min = EXCLUDED.cooldown_min,
              req_int = EXCLUDED.req_int,
              kind = EXCLUDED.kind,
              active = EXCLUDED.active,
              updated_at = now();`,
    );
    const [spell] = await loadSpellTemplates({ ids: [id], activeOnly: false });
    if (!spell) throw new Error("Заклинание сохранено, но не читается — проверь базу");
    return { ok: true, spell };
  });

/** Убрать из игры или вернуть. Единственный способ «удалить» заклинание. */
export const adminSetSpellActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1).max(120), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; id: string; active: boolean }> => {
    requireAdmin();
    await mcpExec(
      `UPDATE yuplink.raid_spell
          SET active = ${data.active}, updated_at = now()
        WHERE id = ${sqlStr(data.id)};`,
    );
    return { ok: true, id: data.id, active: data.active };
  });
