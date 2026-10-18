// Переключатель языка — общий для экрана входа и меню в шапке.
//
// На входе он нужен до всякой сессии: человек открыл приложение, увидел
// английский и должен суметь переключиться, не заходя внутрь. Выбор
// сохраняется на устройстве сразу, а в аккаунт уедет, когда сессия появится
// (setMyLang без сессии просто промолчит — так и задумано).
import { useLang } from "@/lib/i18n";
import { useSetLang } from "@/lib/langPrefs";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/store";

const LABEL: Record<Lang, string> = { ru: "🇷🇺 RU", en: "🇬🇧 EN" };

export function LangSwitch({
  /** «pill» — самостоятельная плашка (экран входа), «row» — строка в меню. */
  variant = "row",
  className,
}: {
  variant?: "pill" | "row";
  className?: string;
}) {
  const lang = useLang();
  const setLang = useSetLang();
  const pill = variant === "pill";
  return (
    <div
      className={cn(
        "flex gap-1",
        pill && "rounded-full border border-border/60 bg-background/40 p-1 backdrop-blur",
        className,
      )}
    >
      {(["en", "ru"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "font-medium transition",
            pill
              ? "rounded-full px-3 py-1.5 text-xs"
              : "flex-1 rounded-md border px-2 py-1 text-xs",
            lang === l
              ? pill
                ? "bg-gold/15 text-gold"
                : "border-gold/40 bg-gold/10 text-gold"
              : pill
                ? "text-muted-foreground hover:text-foreground"
                : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
          )}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
