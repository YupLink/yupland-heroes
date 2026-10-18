// Админ: раздать энергию активным игрокам — подарком, а не молча на счёт.
//
// Соседняя карточка «Начислить себе» кладёт энергию сразу; здесь другое: на
// каждого игрока заводится подарок, и энергия появится, когда он его заберёт.
// Это даёт две вещи, которых у прямого начисления не было: игрок видит, что
// ему что-то дали, и получает письмо в бот.
//
// Кому: только аккаунты с привязанным Telegram, активные за последние 48 часов
// (счётчик под кнопкой считает их живьём).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { adminGiftEnergyToActive, adminActivePlayersCount } from "@/server/api/gifts-admin";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";

export function AdminGiftEnergyCard() {
  const t = useT();
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const isAdmin = !!session.data?.isAdmin;
  const [amount, setAmount] = useState("10");

  const active = useQuery({
    queryKey: ["admin-active-players"],
    queryFn: () => adminActivePlayersCount(),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const send = useMutation({
    mutationFn: () => adminGiftEnergyToActive({ data: { amount: Math.trunc(Number(amount)) } }),
    onSuccess: (r) => {
      toast.success(t("gifts.admin.done", { n: r.accounts, sent: r.notified }));
      void active.refetch();
      // Админ и сам попадает в раздачу: без этого его кружок подарка появился
      // бы только через минуту, на следующем автообновлении.
      qc.invalidateQueries({ queryKey: ["my-gifts"], refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (!isAdmin) return null;
  const n = Math.trunc(Number(amount));
  const valid = Number.isFinite(n) && n > 0;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-pink-400/40 bg-pink-500/5 p-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-300">
        <Gift className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{t("gifts.admin.title")}</div>
        <div className="text-[11px] text-muted-foreground">
          {t("gifts.admin.hint")}
          {active.data ? ` · ${active.data.accounts}` : ""}
        </div>
      </div>
      <input
        type="number"
        min={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-16 shrink-0 rounded-lg border border-border bg-secondary/40 px-2 py-2 text-center text-sm font-bold outline-none focus:border-pink-400/60"
      />
      <button
        onClick={() => send.mutate()}
        disabled={!valid || send.isPending}
        className="shrink-0 rounded-xl bg-pink-500/90 px-4 py-2 text-xs font-bold text-pink-950 transition enabled:hover:scale-[1.02] disabled:opacity-40"
      >
        {send.isPending ? "…" : t("gifts.admin.send")}
      </button>
    </div>
  );
}
