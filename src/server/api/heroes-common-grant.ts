// Разовая раздача «обычного героя» (common) активным игрокам, у которых
// героя пока нет.
//
// Common — стартовый герой на выбор расы: 10 уровней, 1 слот книги, 1
// ячейка рюкзака, 4 места артефактов (голова/тело/правая рука/ноги).
// Из фишек не создаётся (convertRuleForChipLevel возвращает null для <3★).
// Раздача идёт подарком (createGifts) — игрок увидит его в кружке над
// картой и заберёт сам. Идемпотентно на source_ref: повторный вызов
// подарок не задваивает.
//
// Что «активен»: последняя запись в acc_ledger не старше 48 часов.
// Что «есть герой»: любая запись user_game_item.kind='hero' у аккаунта
// (включая спящих) или hero_instance у аккаунта.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin, currentAccount } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { createGifts } from "./gifts-create";

/** id стартового common-шаблона. Один на всех: расы, если понадобятся,
 *  будут отдельными шаблонами, но подарок сейчас общий. */
const COMMON_TPL_ID = "hero_common_starter";
const COMMON_TPL_NAME = "Обычный герой";
const COMMON_TPL_DESC =
  "Стартовый герой: 10 уровней, 1 заклинание, 1 ячейка рюкзака, четыре слота артефактов " +
  "(голова, тело, правая рука, ноги). Из фишек не превращается.";
// Раса и спец ОБЯЗАТЕЛЬНЫ: статы считаются по RACE_STATS[раса][спец], без пары
// герой на любом уровне нули (инцидент 15.09.2026 с двумя common-шаблонами из
// конструктора). Раньше INSERT шёл без них — сырым SQL мимо zod-гарда
// items-hero-guard. Юпик/Воин — нейтральная пара; владелец волен сменить её в
// конструкторе, шаблон обычный.
const COMMON_TPL_RACE = "Юпик";
const COMMON_TPL_SPEC = "Воин";

async function ensureCommonTemplate(): Promise<void> {
  // Идемпотентно: id стабильный. Level=1 — под это подхватывается
  // rarityOfTemplateLevel и wakeHeroInstance пишет rarity='common'.
  await mcpExec(
    `INSERT INTO yuplink.mystic_item_template
       (id, kind, name, description, image_url, level, race, specialization,
        active, created_at, created_by_wallet)
     VALUES (${sqlStr(COMMON_TPL_ID)}, 'hero', ${sqlStr(COMMON_TPL_NAME)},
             ${sqlStr(COMMON_TPL_DESC)}, NULL, 1, ${sqlStr(COMMON_TPL_RACE)},
             ${sqlStr(COMMON_TPL_SPEC)}, true, now(), 'system')
     ON CONFLICT (id) DO NOTHING;`,
    { wrapJson: false },
  );
}

type Target = { account_id: string };

async function findActiveWithoutHero(): Promise<string[]> {
  // NOT EXISTS вместо LEFT JOIN: у аккаунта может быть много ledger-записей,
  // и через JOIN пришлось бы схлопывать по DISTINCT. Индексы (acc_ledger по
  // account_id + created_at, user_game_item/hero_instance по account_id)
  // делают этот план дешёвым.
  const rows = (await mcpExec(
    `SELECT DISTINCT l.account_id
       FROM yuplink.acc_ledger l
      WHERE l.created_at >= now() - interval '48 hours'
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.user_game_item u
           WHERE u.account_id = l.account_id AND u.kind = 'hero'
        )
        AND NOT EXISTS (
          SELECT 1 FROM yuplink.hero_instance h
           WHERE h.account_id = l.account_id
        );`,
    { wrapJson: true },
  ).catch(() => [])) as Target[];
  return (rows ?? []).map((r) => r.account_id);
}

/**
 * Раздача common-героя. Только для владельца. Ответ — сколько подарков ушло
 * и сколько было идемпотентно отброшено (те же source_ref уже лежали).
 */
export const adminGrantCommonToDormant = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    templateId: string;
    candidates: number;
    delivered: number;
    skippedExisting: number;
  }> => {
    requireAdmin();
    await ensureCommonTemplate();

    const accounts = await findActiveWithoutHero();
    if (accounts.length === 0) {
      return {
        templateId: COMMON_TPL_ID,
        candidates: 0,
        delivered: 0,
        skippedExisting: 0,
      };
    }

    // Одна пачка createGifts на всё: там ON CONFLICT (source_ref) — повторные
    // раздачи одному и тому же аккаунту не задваиваются. source_ref
    // стабильный по (шаблон, аккаунт), а не по времени — иначе идемпотентность
    // разлеталась бы на каждом клике.
    const gifts = accounts.map((accountId) => ({
      accountId,
      kind: "hero" as const,
      amount: 1,
      refId: COMMON_TPL_ID,
      title: COMMON_TPL_NAME,
      image: null,
      sourceRef: `common-starter:${COMMON_TPL_ID}:${accountId}`,
      createdBy: "admin_common_starter",
    }));
    const written = await createGifts(gifts, { notify: true });
    return {
      templateId: COMMON_TPL_ID,
      candidates: accounts.length,
      delivered: written.length,
      skippedExisting: accounts.length - written.length,
    };
  },
);

/**
 * Отдельная ручка «дать common себе» — для владельца, чтобы посмотреть на
 * героя на своём аккаунте. Обычная раздача его пропускает: у владельца
 * герои уже есть. Тут фильтра «нет героя» нет, но source_ref всё равно
 * стабильный — двойной клик подарок не задваивает.
 */
export const adminGrantCommonToSelf = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    templateId: string;
    accountId: string;
    delivered: boolean;
  }> => {
    requireAdmin();
    await ensureCommonTemplate();
    const accountId = await currentAccount();
    if (!accountId) throw new Error("Нет активной сессии");
    const written = await createGifts(
      [
        {
          accountId,
          kind: "hero",
          amount: 1,
          refId: COMMON_TPL_ID,
          title: COMMON_TPL_NAME,
          image: null,
          sourceRef: `common-self:${COMMON_TPL_ID}:${accountId}`,
          createdBy: "admin_common_self",
        },
      ],
      { notify: true },
    );
    return {
      templateId: COMMON_TPL_ID,
      accountId,
      delivered: written.length > 0,
    };
  },
);
