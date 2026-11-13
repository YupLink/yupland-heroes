// Выключатель «вход через Google для всех» (владелец, 06.11.2026: «откроем для новых
// игроков»). Выключен — войти Google-игроком может только сессия админа.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { adminSetGoogleOpen } from "@/server/api/google-login";

export function GoogleOpenSwitch({ on, queryKey }: { on: boolean; queryKey: string[] }) {
  const t = useT();
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (next: boolean) => adminSetGoogleOpen({ data: { on: next } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey, refetchType: "all" });
      void qc.invalidateQueries({ queryKey: ["google-login-config"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold">
      {t("google.open")}
      <Switch checked={on} disabled={set.isPending} onCheckedChange={(v) => set.mutate(v)} />
    </label>
  );
}
