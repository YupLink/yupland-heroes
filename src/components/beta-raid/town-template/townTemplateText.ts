// Тексты панели шаблонов городов — на двух языках (русский по умолчанию).
import type { Lang } from "@/lib/store";

export type TownTemplateText = ReturnType<typeof townTemplateText>;

export function townTemplateText(lang: Lang) {
  const ru = lang !== "en";
  const p = (r: string, e: string) => (ru ? r : e);
  return {
    title: p("Шаблон города", "Town template"),
    name: p("Название", "Name"),
    save: p("Сохранить", "Save"),
    tapHall: p("Тапни по ратуше города", "Tap the town hall"),
    uploadFirst: p("Сначала «Выгрузить»", "Upload your edits first"),
    saved: (n: number) => (ru ? `Сохранён: построек ${n}` : `Saved: ${n} buildings`),
    buildings: (n: number) => (ru ? `построек ${n}` : `${n} buildings`),
    deleteAsk: p("Удалить?", "Delete?"),
    errors: {
      "tpl.no_hall": p("Рядом нет ратуши", "No town hall nearby"),
      "tpl.not_island": p("Только на острове новичка", "Only on a newbie island"),
    } as Record<string, string>,
    failed: p("Не вышло", "Failed"),
  };
}

/** Ошибка ручки — ключом tpl.* или текстом сервера. */
export function templateError(t: TownTemplateText, e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  return t.errors[msg] ?? (msg || t.failed);
}
