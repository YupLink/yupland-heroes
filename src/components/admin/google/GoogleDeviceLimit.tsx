// Выключатель «одно устройство — один Google-аккаунт» (владелец, 29.10.2026):
// «единственное, что нельзя будет, — вывод наружу и ограничение по созданию аккаунтов».
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { adminSetGoogleDeviceLimit } from "@/server/api/google-login";

export function GoogleDeviceLimit({ on, queryKey }: { on: boolean; queryKey: string[] }) {
  const t = useT();
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (next: boolean) => adminSetGoogleDeviceLimit({ data: { on: next } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey, refetchType: "all" }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      {t("google.device_limit")}
      <Switch checked={on} disabled={set.isPending} onCheckedChange={(v) => set.mutate(v)} />
    </label>
  );
}
