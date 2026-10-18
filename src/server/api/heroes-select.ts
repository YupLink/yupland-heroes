// Выбор героя, которым игрок ходит по карте.
//
// Выбранный ровно один на аккаунт: назначая нового, снимаем отметку со
// старого. Не выбран никто — на карте прежний рыцарь (безрасовый).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { requireWallet } from "../auth";
import { accountOf } from "./user";
import { requireAtCastle } from "./beta-raid/castle";
import { freeHeroSql, heroLockSql, requireHeroFree } from "./hero-rest";
import { sqlRow } from "./beta-raid/chest/chest-row";

/** Сколько ждать между сменами основного героя. */
export const HERO_SWITCH_HOURS = 24;

/**
 * Сила героя грузится через import(): hero-power сам читает отряд героя, и при
 * статическом импорте модули замкнулись бы в кольцо.
 */
const heroPowerApi = () => import("./beta-raid/hero-power");

/** Когда аккаунту снова можно менять героя (null — хоть сейчас). */
export async function heroSwitchAvailableAt(wallet: string): Promise<string | null> {
  const { getAccountId } = await import("../accountBalances");
  const accountId = await getAccountId(wallet).catch(() => null);
  if (!accountId) return null;
  const rows = (await mcpExec(
    `SELECT hero_switched_at FROM yuplink.accounts WHERE id = ${sqlStr(accountId)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ hero_switched_at: string | null }>;
  const last = rows?.[0]?.hero_switched_at;
  if (!last) return null;
  const next = new Date(last).getTime() + HERO_SWITCH_HOURS * 3600_000;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

/**
 * Смена основного ОДНИМ оператором: прежний снимается только вместе с
 * назначением нового, и только если новый свой и свободен (не отдыхает, не
 * батрачит). Отказ оставляет прежнего на месте. Перед оператором — замок
 * героя: постановка на грядку держит тот же (field-heroes::guardedJoinSql).
 * Ответ — _row {chosen}. Текстом — чтобы тот же SQL проверялся на живой базе
 * (scripts/check-hero-rest-sql.ts).
 */
export function switchMainSql(list: string, heroId: string): string {
  const target = sqlStr(heroId);
  return `${heroLockSql(heroId)}
    WITH up AS (
      UPDATE yuplink.hero_instance h
         SET selected_at = CASE WHEN h.id = ${target} THEN now() ELSE NULL END
       WHERE h.account_id IN (${list})
         AND (h.selected_at IS NOT NULL OR h.id = ${target})
         AND EXISTS (SELECT 1 FROM yuplink.hero_instance x
                      WHERE x.id = ${target} AND x.account_id IN (${list})
                        AND ${freeHeroSql("x")})
      RETURNING h.id, (h.selected_at IS NOT NULL) AS chosen
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT COALESCE(bool_or(id = ${target} AND chosen), false) AS chosen FROM up
    ) _t;`;
}

/** Копия героя-предмета, за которой ещё нет экземпляра. */
async function freeCopyOfTemplate(list: string, templateId: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT u.id FROM yuplink.user_game_item u
      WHERE u.account_id IN (${list}) AND u.kind = 'hero'
        AND u.template_id = ${sqlStr(templateId)}
        AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h WHERE h.item_id = u.id)
      ORDER BY u.id LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string }>;
  return rows?.[0]?.id ?? null;
}

export const selectMyHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        /** null — снять выбор, вернуться к рыцарю. */
        heroId: z.string().min(1).nullable(),
        /**
         * Копия предмета спящего героя: экземпляр заводится ровно на неё.
         * Раньше сюда слали шаблон, а будить героя научились по копии — и
         * выбор спящего отвечал «Это не твой герой» (жалоба 10.09.2026).
         */
        itemId: z.string().min(1).optional(),
        /**
         * Старый путь — шаблон. Оставлен для вкладок, открытых до правки:
         * копию по нему найдём сами, взяв ту, у которой экземпляра ещё нет.
         */
        templateId: z.string().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const account = await accountOf(wallet);
    const list = sqlStr(account);

    // С включённой силой героев менять его можно только дома, в замке — зато
    // сколько угодно раз: замок и есть та цена, которой раньше был сутки.
    const { heroPowerEnabled, invalidateHeroPower } = await heroPowerApi();
    const heroPower = await heroPowerEnabled(wallet);
    if (heroPower) await requireAtCastle(wallet);

    // Смена героя раз в сутки: первый выбор и снятие — свободно.
    const hadHero =
      (
        (await mcpExec(
          `SELECT id FROM yuplink.hero_instance
        WHERE account_id IN (${list}) AND selected_at IS NOT NULL LIMIT 1;`,
          { wrapJson: true },
        ).catch(() => [])) as Array<{ id: string }>
      ).length > 0;
    if (hadHero && data.heroId && !heroPower) {
      const until = await heroSwitchAvailableAt(wallet);
      if (until) {
        const hours = Math.ceil((new Date(until).getTime() - Date.now()) / 3600_000);
        throw new Error(`Сменить героя можно раз в сутки — попробуй через ${hours} ч`);
      }
    }

    const clearSelected = () =>
      mcpExec(
        `UPDATE yuplink.hero_instance SET selected_at = NULL
          WHERE account_id IN (${list}) AND selected_at IS NOT NULL;`,
      );
    if (!data.heroId && !data.templateId && !data.itemId) {
      await clearSelected();
      invalidateHeroPower(wallet);
      return { ok: true as const, heroId: null };
    }

    // Спящего героя будим здесь же: экземпляр появляется ровно в момент, когда
    // игрок впервые ставит его основным.
    let heroId = data.heroId;
    if (!heroId) {
      const { wakeHeroInstance } = await import("./heroes-wake");
      // Копия предмета известна — будим её. Пришёл только шаблон (старый
      // клиент) — берём свободную копию: ту, за которой ещё нет экземпляра.
      const itemId = data.itemId ?? (await freeCopyOfTemplate(list, data.templateId as string));
      if (!itemId) throw new Error("Это не твой герой");
      heroId = await wakeHeroInstance(wallet, account, itemId);
    }

    // Занятый основным не становится: батрачащий — пока на грядке («будет
    // недоступен, пока батрачит»), отдыхающий — пока идёт отдых после снятия
    // издалека (hero-rest.ts). Быстрый отказ с понятной причиной — здесь, а
    // сама смена — одним оператором: прежний основной снимается только вместе
    // с назначением нового, и отказ (занят, чужой) не оставит игрока без героя.
    await requireHeroFree(heroId as string);
    const res = sqlRow<{ chosen: boolean }>(
      (await mcpExec(switchMainSql(list, heroId as string))) as unknown[],
    );
    if (!res?.chosen) {
      // Занятым он мог стать между проверкой и записью — назовём причину.
      await requireHeroFree(heroId as string);
      throw new Error("Это не твой герой");
    }

    const { getAccountId } = await import("../accountBalances");
    const accountId = await getAccountId(wallet).catch(() => null);
    if (accountId) {
      await mcpExec(
        `UPDATE yuplink.accounts SET hero_switched_at = now() WHERE id = ${sqlStr(accountId)};`,
      ).catch(() => {});
    }
    // Кэш силы героя держит статы и отряд — после смены он врёт.
    invalidateHeroPower(wallet);
    // Иммунитет живёт на конкретном герое и его надетых вещах: смена героя
    // висящий дебафф не снимает (правило владельца 21.09).
    // Возвращаем id, который реально выбран: у разбуженного он новый, и клиент
    // без него подсвечивал бы пустоту.
    return { ok: true as const, heroId };
  });

/** Кто сейчас выбран — для подсветки в инвентаре. */
export const getMySelectedHero = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  const list = sqlStr(await accountOf(wallet));
  const rows = (await mcpExec(
    `SELECT h.id, h.template_id, h.level, t.race, t.name, t.image_url, t.specialization
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
      WHERE h.account_id IN (${list}) AND h.selected_at IS NOT NULL
      ORDER BY h.selected_at DESC LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    id: string;
    template_id: string;
    level: number;
    race: string | null;
    name: string | null;
    image_url: string | null;
    specialization: string | null;
  }>;
  const r = rows?.[0];
  // Когда снова можно менять героя — попап показывает это до подтверждения.
  // При включённой силе героев суток нет вовсе, и таймер показывать нечего.
  const { heroPowerEnabled } = await heroPowerApi();
  const switchAvailableAt = (await heroPowerEnabled(wallet))
    ? null
    : await heroSwitchAvailableAt(wallet);
  return r
    ? {
        heroId: r.id,
        templateId: r.template_id,
        level: Number(r.level) || 0,
        race: r.race,
        name: r.name,
        imageUrl: r.image_url,
        specialization: r.specialization,
        switchAvailableAt,
      }
    : {
        heroId: null,
        templateId: null,
        level: 0,
        race: null,
        name: null,
        imageUrl: null,
        specialization: null,
        switchAvailableAt,
      };
});
