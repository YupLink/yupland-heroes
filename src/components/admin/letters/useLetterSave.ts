// Сохранение письма из админки — одно на страницу писем и генератор письма о
// турнирах (он открывает ту же форму поверх /admin/tournaments). После ответа —
// invalidate списка писем: плашка появляется сразу, без F5.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { letterErrText } from "@/lib/letters";
import { adminLetterSave } from "@/server/api/letters/letters-admin";
import { savePayload, sendsToAll, type LetterDraft } from "./letterDraft";

export const LETTERS_KEY = ["admin-letters"] as const;

export function useLetterSave(onSaved: () => void) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: LetterDraft) => adminLetterSave({ data: savePayload(d) }),
    onSuccess: (_r, d) => {
      toast.success(t(sendsToAll(d) ? "letter.adm.sent_ok" : "letter.adm.saved_ok"));
      onSaved();
    },
    onError: (e: Error) => toast.error(letterErrText(e, t)),
    onSettled: () => void qc.invalidateQueries({ queryKey: LETTERS_KEY }),
  });
}
