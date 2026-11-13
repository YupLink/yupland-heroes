import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Газеты на картах и «Газетный киоск» (§8.96, 31.10.2026): отказы сервера.
export const dict: Record<string, Entry> = {
  "kiosk.not_built": {
    ru: "Сначала постройте газетный киоск",
    en: "Build the newspaper kiosk first",
  },
  "newspaper.gone": { ru: "Газеты здесь уже нет", en: "The newspaper is gone" },
  "newspaper.approach": {
    ru: "Подойдите к газете вплотную",
    en: "Move next to the newspaper",
  },
  "newspaper.already_read": {
    ru: "Этот выпуск уже прочитан",
    en: "You have already read this issue",
  },
  "newspaper.not_opened": {
    ru: "Сначала откройте газету",
    en: "Open the newspaper first",
  },
  "newspaper.need_kiosk": {
    ru: "Отложенные газеты читают в газетном киоске",
    en: "Saved newspapers are read at a newspaper kiosk",
  },
  "newspaper.count_not_set": {
    ru: "Не задано число газет на карту",
    en: "Newspapers per map are not set",
  },
  "newspaper.not_draft": {
    ru: "Выпуск уже размещён или снят",
    en: "The issue is already published or withdrawn",
  },
  "newspaper.bad_date": { ru: "Неверная дата выпуска", en: "Invalid issue date" },
  "newspaper.bad_image": {
    ru: "Картинка выпуска — только с сайта игры или IPFS",
    en: "Issue image must be hosted on the game site or IPFS",
  },
};
