// Команда проекта (владелец, партнёр, дизайнер) — только из env сервера.
// Публичный код равен боевому: кошельков, Telegram id, юзернеймов и аккаунтов
// команды в коде нет.
//
// Значения в серверный бандл зашивает сборка (vite.config.ts: define только
// для ssr/nitro, клиент их не видит). Define подменяет ровно текст
// `process.env.TEAM_…`, поэтому каждое поле читается литералом, без
// process.env[name]. Читаем внутри функций — модуль можно импортировать
// откуда угодно, а тесты подставляют свои значения через vi.stubEnv.
//
// Пусто в env = «никого»: лишних прав нет, уведомление не уходит, а деньги
// останавливает requireTeamWallet — на пустой кошелёк не платим никогда.

export type TeamWalletKind = "owner" | "partner";

const str = (v: string | undefined): string => (v ?? "").trim();

const tgId = (v: string | undefined): number | null => {
  const n = Number(str(v));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Кошелёк владельца (TEAM_OWNER_WALLET); "" — не задан. */
export const teamOwnerWallet = (): string => str(process.env.TEAM_OWNER_WALLET);
/** Кошелёк партнёра (TEAM_PARTNER_WALLET); "" — не задан. */
export const teamPartnerWallet = (): string => str(process.env.TEAM_PARTNER_WALLET);

/** Telegram id владельца (TEAM_OWNER_TG); null — не задан. */
export const teamOwnerTg = (): number | null => tgId(process.env.TEAM_OWNER_TG);
/** Telegram id партнёра (TEAM_PARTNER_TG); null — не задан. */
export const teamPartnerTg = (): number | null => tgId(process.env.TEAM_PARTNER_TG);
/** Telegram id дизайнера (TEAM_DESIGNER_TG); null — не задан. */
export const teamDesignerTg = (): number | null => tgId(process.env.TEAM_DESIGNER_TG);

/** Telegram-юзернейм дизайнера без «@» (TEAM_DESIGNER_TG_USERNAME); "" — не задан. */
export const teamDesignerTgUsername = (): string => str(process.env.TEAM_DESIGNER_TG_USERNAME);
/** Аккаунт дизайнера acc_… (TEAM_DESIGNER_ACCOUNT); "" — не задан. */
export const teamDesignerAccount = (): string => str(process.env.TEAM_DESIGNER_ACCOUNT);

/** Заданные Telegram id в переданном порядке; незаданные выпадают. */
export function teamTgIds(...ids: Array<number | null>): number[] {
  return ids.filter((id): id is number => id != null);
}

export function teamWallet(kind: TeamWalletKind): string {
  return kind === "owner" ? teamOwnerWallet() : teamPartnerWallet();
}

/** Короткое имя кошелька для подписей и тегов: «name.tg» → «name». */
export function teamWalletTag(kind: TeamWalletKind): string {
  return teamWallet(kind).split(".")[0];
}

/** Кошелёк для перевода денег: не задан — ошибка, перевод не уходит. */
export function requireTeamWallet(kind: TeamWalletKind): string {
  const wallet = teamWallet(kind);
  if (!wallet) {
    throw new Error(`TEAM_${kind.toUpperCase()}_WALLET не задан — перевод остановлен`);
  }
  return wallet;
}
