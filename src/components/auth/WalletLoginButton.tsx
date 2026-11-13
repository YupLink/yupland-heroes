// «Войти через NEAR-кошелёк» на экране входа в браузере (06.11.2026): старые
// кошельки входят в свой аккаунт. Страница /near (11.11.2026, §8.127): новый
// кошелёк получает свой аккаунт — сервер решает.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { useAppStore } from "@/lib/store";
import { resetAccountQueries } from "@/lib/auth/resetAccountQueries";
import { runWalletLogin } from "@/lib/auth/walletLogin";

export function WalletLoginButton({ entry = "game" }: { entry?: "game" | "near" }) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setWallet = useAppStore((s) => s.setWallet);
  const login = useMutation({
    mutationFn: () => runWalletLogin(entry),
    onSuccess: async (res) => {
      // Сессия уже другая: аккаунтные ключи — заново, остальное перечитать.
      await resetAccountQueries(qc);
      setWallet(res.wallet);
      void qc.invalidateQueries({ refetchType: "all" });
      void navigate({ to: "/chips" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <button
      type="button"
      disabled={login.isPending}
      onClick={() => login.mutate()}
      className="mx-auto flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-5 text-sm font-semibold text-foreground transition hover:bg-card disabled:opacity-60"
    >
      {login.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Wallet className="h-4 w-4 text-gold" aria-hidden="true" />
      )}
      {t("walletLogin.button")}
    </button>
  );
}
