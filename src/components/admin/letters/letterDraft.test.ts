// Черновик письма: английская пара полей, «показывать до» по UTC, письмо из
// генератора о турнирах, предпросмотр на выбранном языке, «Отправить всем».
import { describe, expect, it } from "vitest";
import type { LetterAdminRow } from "@/lib/letters";
import {
  draftError,
  draftFromGenerated,
  draftOfRow,
  emptyLetterDraft,
  previewOf,
  savePayload,
  sendsToAll,
  type LetterDraft,
} from "./letterDraft";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const draft = (p: Partial<LetterDraft> = {}): LetterDraft => ({
  ...emptyLetterDraft(),
  title: "Турнир",
  body: "Текст",
  ...p,
});
const row: LetterAdminRow = {
  id: "l1",
  title: "Турнир",
  body: "Текст",
  image: null,
  titleEn: "Tournament",
  bodyEn: "Text",
  audience: "all",
  accounts: [],
  active: true,
  createdAt: null,
  seen: 0,
  showUntil: "2026-10-01T10:00:00.000Z",
};

describe("письмо из генератора", () => {
  it("новое, «Всем», ru+en, срок — поле по UTC", () => {
    const d = draftFromGenerated({
      title: "Объявлен турнир",
      body: "Текст",
      titleEn: "Tournament announced",
      bodyEn: "Text",
      showUntil: "2026-10-11T23:59:00.000Z",
    });
    expect(d).toMatchObject({ audience: "all", lang: "ru", titleEn: "Tournament announced" });
    expect(d.id).toBeUndefined();
    expect(d.showUntil).toBe("2026-10-11T23:59");
    expect(sendsToAll(d)).toBe(true);
    expect(draftError(d, NOW)).toBeNull();
  });

  it("без конца — бессрочно", () => {
    const g = { title: "T", body: "B", titleEn: "T", bodyEn: "B", showUntil: null };
    expect(draftFromGenerated(g).showUntil).toBe("");
  });
});

describe("тело сохранения", () => {
  it("срок — ISO UTC, пусто — null; английская пустая — null", () => {
    expect(savePayload(draft({ showUntil: "2026-10-11T23:59" })).showUntil).toBe(
      "2026-10-11T23:59:00.000Z",
    );
    const p = savePayload(draft({ titleEn: " ", bodyEn: "" }));
    expect(p).toMatchObject({ showUntil: null, titleEn: null, bodyEn: null });
  });

  it("мусор в поле — ошибка даты, а не тихо бессрочно", () => {
    expect(draftError(draft({ showUntil: "2026-02-30T00:00" }), NOW)).toBe("letter.err.until");
  });

  it("новое с прошедшим сроком — ошибка; у истёкшего прежний срок оставить можно", () => {
    expect(draftError(draft({ showUntil: "2026-10-01T10:00" }), NOW)).toBe("letter.err.until_past");
    const d = draftOfRow(row, "acc_me");
    expect(d.showUntil).toBe("2026-10-01T10:00");
    expect(draftError(d, NOW)).toBeNull();
    expect(draftError({ ...d, showUntil: "2026-10-02T10:00" }, NOW)).toBe("letter.err.until_past");
  });
});

describe("язык формы", () => {
  it("строка списка → обе пары; предпросмотр — выбранный язык", () => {
    const d = draftOfRow(row, "acc_me");
    expect(previewOf(d)).toMatchObject({ title: "Турнир", titleEn: null });
    expect(previewOf({ ...d, lang: "en" })).toMatchObject({ title: "Tournament", body: "Text" });
  });

  it("«Отправить всем» — только у нового письма всем", () => {
    expect(sendsToAll(draft({ audience: "all" }))).toBe(true);
    expect(sendsToAll(draft({ audience: "me" }))).toBe(false);
    expect(sendsToAll(draftOfRow(row, "acc_me"))).toBe(false);
  });
});
