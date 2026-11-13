// Белый список вывода в паспорте аккаунта (владелец, 11.11.2026, §8.127): видно всем
// админам, менять — только владельцу (сервер — requirePayoutsAdmin).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { getSession } from "@/server/api/user-auth";
import { adminSetWithdrawListed } from "@/server/api/withdraw-list/withdrawListAdmin";

export function PassportWithdraw({ account, on }: { account: string; on: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const owner = useQuery({ queryKey: ["session"], queryFn: () => getSession() }).data
    ?.isPayoutsAdmin;
  const set = useMutation({
    mutationFn: (next: boolean) => adminSetWithdrawListed({ data: { account, on: next } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-passport"] }),
    onError: (e) => toast.error(humanError(e)),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={on ? "text-muted-foreground" : "font-semibold text-destructive"}>
        {t(on ? "entry.wd_on" : "entry.wd_off")}
      </span>
      {owner && (
        <button
          type="button"
          disabled={set.isPending}
          onClick={() => set.mutate(!on)}
          className="min-h-9 rounded-lg border border-border px-3 py-1.5 disabled:opacity-50"
        >
          {t(on ? "entry.wd_close" : "entry.wd_open")}
        </button>
      )}
    </div>
  );
}
