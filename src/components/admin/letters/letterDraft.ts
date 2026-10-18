// Черновик письма в форме админки ↔ строка списка ↔ то, что уходит на сервер.
//
// Русский и английский текст — две пары полей черновика; форма показывает одну
// пару (переключатель RU | EN — поле lang, на сервер не идёт). «Показывать до» —
// значение поля datetime-local по UTC, как расписание турниров.
import type { Lang } from "@/lib/store";
import {
  isOnlyMe,
  letterError,
  parseAccountList,
  type LetterAdminRow,
  type LetterAudienceInput,
  type LetterSaveInput,
  type PlayerLetter,
} from "@/lib/letters";
import { isoOfUtcInput, utcInputOf } from "@/components/admin/tournaments/tourSchedule";

export type LetterDraft = {
  id?: string;
  /** Какой язык сейчас правят поля «Заголовок» и «Текст». */
  lang: Lang;
  title: string;
  body: string;
  titleEn: string;
  bodyEn: string;
  image: string;
  audience: LetterAudienceInput;
  /** Список «кому» как его пишет админ: через запятую или с новой строки. */
  accountsText: string;
  again: boolean;
  /** «Показывать до» — поле datetime-local по UTC; "" — бессрочно. */
  showUntil: string;
  /** «До», с которым письмо пришло в форму: прошедшее можно оставить как было. */
  savedShowUntil: string;
};

/** Новое письмо — по умолчанию «Только мне»: сначала посмотреть на себе. */
export const emptyLetterDraft = (): LetterDraft => ({
  lang: "ru",
  title: "",
  body: "",
  titleEn: "",
  bodyEn: "",
  image: "",
  audience: "me",
  accountsText: "",
  again: false,
  showUntil: "",
  savedShowUntil: "",
});

export function draftOfRow(row: LetterAdminRow, me: string): LetterDraft {
  const onlyMe = isOnlyMe(row, me);
  const until = utcInputOf(row.showUntil);
  return {
    id: row.id,
    lang: "ru",
    title: row.title,
    body: row.body,
    titleEn: row.titleEn ?? "",
    bodyEn: row.bodyEn ?? "",
    image: row.image ?? "",
    audience: onlyMe ? "me" : row.audience,
    accountsText: row.audience === "list" && !onlyMe ? row.accounts.join(", ") : "",
    // Правка письма «себе» — почти всегда ради того, чтобы увидеть его снова.
    again: onlyMe,
    showUntil: until,
    savedShowUntil: until,
  };
}

/**
 * Письмо из генератора о турнирах: новое, «Всем», ru+en, до конца турниров.
 * Админ смотрит предпросмотр, правит и жмёт «Отправить всем».
 */
export function draftFromGenerated(g: {
  title: string;
  body: string;
  titleEn: string;
  bodyEn: string;
  /** ISO UTC; null — бессрочно. */
  showUntil: string | null;
}): LetterDraft {
  return {
    ...emptyLetterDraft(),
    title: g.title,
    body: g.body,
    titleEn: g.titleEn,
    bodyEn: g.bodyEn,
    audience: "all",
    showUntil: utcInputOf(g.showUntil),
  };
}

export function savePayload(d: LetterDraft): LetterSaveInput {
  const until = isoOfUtcInput(d.showUntil);
  return {
    id: d.id,
    title: d.title.trim(),
    body: d.body,
    titleEn: d.titleEn.trim() || null,
    bodyEn: d.bodyEn.trim() ? d.bodyEn : null,
    image: d.image.trim() || null,
    audience: d.audience,
    accounts: d.audience === "list" ? parseAccountList(d.accountsText) : [],
    // Мусор в поле уходит как есть — проверка назовёт ошибку, а не сотрёт срок.
    showUntil: until === undefined ? d.showUntil : until,
    again: d.id ? d.again : undefined,
  };
}

export function draftError(d: LetterDraft, nowMs: number = Date.now()): string | null {
  const p = savePayload(d);
  return letterError(
    { ...p, image: p.image ?? null },
    { nowMs, keepUntil: d.id ? (isoOfUtcInput(d.savedShowUntil) ?? null) : null },
  );
}

/** Новое письмо всем — кнопка «Отправить всем» вместо «Сохранить». */
export const sendsToAll = (d: Pick<LetterDraft, "id" | "audience">): boolean =>
  !d.id && d.audience === "all";

/**
 * Как письмо увидит игрок — для предпросмотра в админке. Язык — выбранный в
 * форме, а не язык админки: выбранная пара кладётся в основные поля.
 */
export const previewOf = (d: LetterDraft): PlayerLetter => {
  const en = d.lang === "en";
  return {
    id: d.id ?? "preview",
    title: (en ? d.titleEn : d.title).trim(),
    body: (en ? d.bodyEn : d.body).trim(),
    image: d.image.trim() || null,
    titleEn: null,
    bodyEn: null,
  };
};
