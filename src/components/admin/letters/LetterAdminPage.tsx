// Админ · Письма игрокам: окно на весь экран при входе в игру.
//
// Список писем (свежие первыми), создать/изменить, включить/выключить.
// Новое письмо по умолчанию «Только мне» — посмотреть на себе, потом открыть
// всем. После любой мутации — invalidate списка: плашка меняется сразу, без F5.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { letterErrText, type LetterAdminList } from "@/lib/letters";
import { adminLetterList, adminLetterSetActive } from "@/server/api/letters/letters-admin";
import { LetterEditor } from "./LetterEditor";
import { LetterPlate } from "./LetterPlate";
import { draftOfRow, emptyLetterDraft, type LetterDraft } from "./letterDraft";
import { LETTERS_KEY as KEY, useLetterSave } from "./useLetterSave";
import { TourLetterButton, TourLetterGen } from "./TourLetterGen";

export function LetterAdminPage() {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<LetterDraft | null>(null);
  const [tourGen, setTourGen] = useState(false);

  const listQ = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<LetterAdminList> => adminLetterList(),
  });
  const me = listQ.data?.me ?? "";
  const rows = Array.isArray(listQ.data?.letters) ? listQ.data.letters : [];
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const save = useLetterSave(() => setDraft(null));

  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => adminLetterSetActive({ data: v }),
    onSuccess: (_r, v) => toast.success(t(v.active ? "letter.adm.on_ok" : "letter.adm.off_ok")),
    onError: (e: Error) => toast.error(letterErrText(e, t)),
    onSettled: refresh,
  });
  const busyId = toggle.isPending ? toggle.variables?.id : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
          <Mail className="h-5 w-5" />
        </span>
        <h1 className="flex-1 font-display text-2xl font-bold">{t("letter.adm.title")}</h1>
        <TourLetterButton onClick={() => setTourGen(true)} />
        <button
          type="button"
          onClick={() => setDraft(emptyLetterDraft())}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium"
        >
          <Plus className="h-4 w-4" /> {t("letter.adm.create")}
        </button>
      </header>

      {listQ.isPending && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}

      {listQ.isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {letterErrText(listQ.error, t)}
        </p>
      )}

      {listQ.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("letter.adm.empty")}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <LetterPlate
            key={r.id}
            row={r}
            me={me}
            busy={busyId === r.id}
            onEdit={() => setDraft(draftOfRow(r, me))}
            onToggle={() => toggle.mutate({ id: r.id, active: !r.active })}
          />
        ))}
      </div>

      {draft && (
        <LetterEditor
          value={draft}
          onChange={setDraft}
          onSave={() => save.mutate(draft)}
          saving={save.isPending}
          onClose={() => setDraft(null)}
        />
      )}

      {tourGen && <TourLetterGen onClose={() => setTourGen(false)} />}
    </div>
  );
}
