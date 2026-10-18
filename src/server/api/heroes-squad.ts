// Отряд героя: фишки, которыми он сражается.
//
// Раньше отряд собирали заново в каждом бою. Теперь он закреплён за героем —
// это подготовка к тому, чтобы окно выбора фишек в бою исчезло совсем
// (переключатель `hero_squad_battles`, пока выключен).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { requireWallet } from "../auth";
import { accountOf } from "./user";
import { pg } from "../db/pg";
import { matchSquadToChips } from "@/lib/heroSquadMatch";
import { requireAtCastle } from "./beta-raid/castle";

/** Сколько фишек помещается в отряд героя. */
export const SQUAD_SLOTS = 10;

/** Через import(): hero-power читает отряд отсюда, статикой вышло бы кольцо. */
const heroPowerApi = () => import("./beta-raid/hero-power");

const chipSchema = z.object({
  templateId: z.string().min(1),
  level: z.number(),
  serialNo: z.number().nullable().optional(),
});

export type SquadChip = z.infer<typeof chipSchema>;

/** Ключ настройки: боями правит отряд героя, а не автоподбор. */
export const HERO_SQUAD_BATTLES_KEY = "hero_squad_battles";

/** Включён ли режим «сражаемся отрядом героя». Пока выключен по умолчанию. */
export async function heroSquadBattlesEnabled(): Promise<boolean> {
  const row = await pg.settings.findOne({ key: HERO_SQUAD_BATTLES_KEY });
  return row?.value === "true";
}

async function walletList(wallet: string): Promise<string> {
  return sqlStr(await accountOf(wallet));
}

/** Отряд выбранного героя: то, чем он пойдёт в бой. */
export async function selectedHeroSquad(wallet: string): Promise<SquadChip[]> {
  const list = await walletList(wallet);
  const rows = (await mcpExec(
    `SELECT squad FROM yuplink.hero_instance
      WHERE account_id IN (${list}) AND selected_at IS NOT NULL
      ORDER BY selected_at DESC LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ squad: unknown }>;
  const raw = rows?.[0]?.squad;
  if (!Array.isArray(raw)) return [];
  const out: SquadChip[] = [];
  for (const item of raw) {
    const parsed = chipSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out.slice(0, SQUAD_SLOTS);
}

/**
 * Оставить в отряде только те фишки, которые у игрока правда есть.
 *
 * Раньше сюда можно было записать что угодно, включая чужие пятизвёздные:
 * клиенту верили на слово. Отсеиваем молча — состав игрок собирает из своего
 * инвентаря, и честному игроку отказывать не за что. Заодно подтягиваем
 * настоящий серийник: по нему бой находит ТОТ ЖЕ экземпляр.
 */
async function ownedOnly(wallet: string, squad: SquadChip[]): Promise<SquadChip[]> {
  if (squad.length === 0) return [];
  const list = await walletList(wallet);
  const rows = (await mcpExec(
    `SELECT id, template_id, level, serial_no FROM yuplink.user_chip_inventory
      WHERE account_id IN (${list}) AND status = 'owned';`,
    { wrapJson: true },
  )) as Array<{ id: string; template_id: string; level: number; serial_no: number | null }>;
  const { picked } = matchSquadToChips(
    squad,
    (rows ?? []).map((r) => ({
      id: r.id,
      templateId: r.template_id,
      level: Number(r.level),
      serialNo: r.serial_no,
    })),
  );
  return picked.map((p) => ({
    templateId: p.templateId,
    level: p.level,
    serialNo: p.serialNo,
  }));
}

export const getMyHeroSquad = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  return { squad: await selectedHeroSquad(wallet), slots: SQUAD_SLOTS };
});

/** Сохранить отряд выбранного героя. */
export const setMyHeroSquad = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ squad: z.array(chipSchema).max(SQUAD_SLOTS) }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    // Отряд закрепляется дома: подгонять состав под каждого встречного босса
    // прямо перед ударом — не то, ради чего он вообще закрепляется.
    const { heroPowerEnabled, invalidateHeroPower } = await heroPowerApi();
    if (await heroPowerEnabled(wallet)) await requireAtCastle(wallet);
    const squad = await ownedOnly(wallet, data.squad);
    if (data.squad.length > 0 && squad.length === 0) {
      throw new Error("Этих фишек у тебя нет");
    }
    const list = await walletList(wallet);
    const rows = (await mcpExec(
      `UPDATE yuplink.hero_instance
          SET squad = ${sqlStr(JSON.stringify(squad))}::jsonb, updated_at = now()
        WHERE account_id IN (${list}) AND selected_at IS NOT NULL
        RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!rows || rows.length === 0) throw new Error("Сначала выбери основного героя");
    invalidateHeroPower(wallet);
    return { ok: true as const, count: squad.length };
  });
