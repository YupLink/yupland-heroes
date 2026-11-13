// «Имя» в профиле (lib/playerName, владелец 07.11.2026): так игрока видят другие —
// в турнирах, досках урона, лавке и дуэлях фишек. Пусто — снова @ник Telegram.
import { useState } from "react";
import { ChevronRight, UserRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { NAME_MAX, nameProblem, normalizeName } from "@/lib/playerName";
import { MY_NAME_KEY, useMyName } from "@/lib/hooks/useMyName";
import { setMyName } from "@/server/api/player-name/player-name-fns";

const button = "rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50";

export function ProfileNameRow({ fallback }: { fallback: string | null }) {
  const t = useT();
  const qc = useQueryClient();
  const my = useMyName();
  const current = my.data?.name ?? null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (name: string) => setMyName({ data: { name } }),
    onSuccess: (res) => {
      qc.setQueryData(MY_NAME_KEY, res);
      setOpen(false);
      setError(null);
    },
    onError: (e: Error) => setError(serverErrorText(e, t)),
  });
  const submit = (raw: string) => {
    const name = normalizeName(raw);
    const bad = nameProblem(name);
    if (bad) return setError(t(bad));
    save.mutate(name);
  };
  return (
    <section>
      <button
        data-game-button="row"
        className="castle-profile__row"
        aria-expanded={open}
        onClick={() => {
          setDraft(current ?? "");
          setError(null);
          setOpen(!open);
        }}
      >
        <UserRound aria-hidden="true" />
        <span>{t("pname.title")}</span>
        <span className="truncate text-muted-foreground">{current ?? fallback ?? "—"}</span>
        <ChevronRight className="castle-profile__chevron" aria-hidden="true" />
      </button>
      {open && (
        <form
          className="space-y-2 px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <input
            value={draft}
            maxLength={NAME_MAX + 10}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("pname.placeholder")}
            aria-label={t("pname.title")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className={button} disabled={save.isPending}>
              {t("pname.save")}
            </button>
            {current && (
              <button
                type="button"
                className={button}
                disabled={save.isPending}
                onClick={() => submit("")}
              >
                {t("pname.clear")}
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
