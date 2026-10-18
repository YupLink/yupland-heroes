// Заголовок и текст письма на выбранном языке: переключатель RU | EN над одной
// парой полей. Английская пара необязательна: пустая — игрок с английским
// интерфейсом увидит русский текст (letterInLang).
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/store";
import { LETTER_BODY_MAX, LETTER_TITLE_MAX } from "@/lib/letters";
import { CAP, FIELD } from "./letterCls";
import type { LetterDraft } from "./letterDraft";

const LANGS: ReadonlyArray<Lang> = ["ru", "en"];

export function LetterTextFields({
  value,
  onPatch,
}: {
  value: LetterDraft;
  onPatch: (p: Partial<LetterDraft>) => void;
}) {
  const t = useT();
  const en = value.lang === "en";
  return (
    <>
      <div className="flex gap-1">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={value.lang === l}
            onClick={() => onPatch({ lang: l })}
            className={cn(
              "h-8 min-w-12 rounded-lg border px-3 text-xs font-semibold uppercase transition",
              value.lang === l
                ? "border-gold/50 bg-gold/15 text-gold"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <label className="block">
        <span className={CAP}>{t("letter.adm.f_title")}</span>
        <input
          value={en ? value.titleEn : value.title}
          lang={value.lang}
          maxLength={LETTER_TITLE_MAX}
          onChange={(e) => onPatch(en ? { titleEn: e.target.value } : { title: e.target.value })}
          className={cn(FIELD, "h-10")}
        />
      </label>
      <label className="block">
        <span className={CAP}>{t("letter.adm.f_body")}</span>
        <textarea
          value={en ? value.bodyEn : value.body}
          lang={value.lang}
          rows={9}
          maxLength={LETTER_BODY_MAX}
          onChange={(e) => onPatch(en ? { bodyEn: e.target.value } : { body: e.target.value })}
          className={cn(FIELD, "resize-y py-2 leading-relaxed")}
        />
      </label>
    </>
  );
}
