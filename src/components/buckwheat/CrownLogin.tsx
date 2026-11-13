// Вход на странице-ссылке «Короны гречневого королевства» (/crown, владелец 08.11.2026):
// NEAR-кошелёк с подписью. Привязан куда-то — откроется тот аккаунт; новый кошелёк
// получает свой (сервер: wallet-login, entry crown). Коннектор — только по кнопке
// (владелец 08.11: «я сам должен выбрать, что хочу войти»). После входа — игра.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { LangSwitch } from "@/components/LangSwitch";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { useAppStore } from "@/lib/store";
import { resetAccountQueries } from "@/lib/auth/resetAccountQueries";
import { runWalletLogin } from "@/lib/auth/walletLogin";
import { buckwheatClientLog } from "@/server/api/buckwheat/bwApi";

export function CrownLogin({ onDone }: { onDone: (wallet: string) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const setWallet = useAppStore((s) => s.setWallet);
  const login = useMutation({
    mutationFn: () => runWalletLogin("crown"),
    onSuccess: async (res) => {
      await resetAccountQueries(qc);
      setWallet(res.wallet);
      void qc.invalidateQueries({ refetchType: "all" });
      onDone(res.wallet);
    },
    onError: (e: Error) => {
      // Причина — в журнал сервера ([bw] client): вход по ссылке не должен молча стоять.
      void buckwheatClientLog({ data: { text: `вход ✗ ${e.message}`.slice(0, 200) } }).catch(
        () => {},
      );
      // Закрыл выбор кошелька — не ошибка: остаётся кнопка.
      if (!/cancel|reject|denied|closed/i.test(e.message)) toast.error(humanError(e));
    },
  });
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#111313] bg-[url('/minigames/buckwheat/art/evening-garden.webp')] bg-cover bg-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,var(--app-top,env(safe-area-inset-top,0px)))] text-center">
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-7">
        <h1 className="font-serif text-[2.1rem] font-bold leading-tight text-[#ffe1a0] [text-shadow:0_2px_#4c2218]">
          {t("bw.title")}
        </h1>
        <button
          type="button"
          disabled={login.isPending}
          onClick={() => login.mutate()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#ffd481] bg-gradient-to-b from-[#ffd479] to-[#b96428] px-5 text-base font-extrabold text-[#3a1c0b] shadow-[0_4px_0_#643218] disabled:opacity-60"
        >
          {login.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Wallet className="h-5 w-5" aria-hidden="true" />
          )}
          {t("bw.login")}
        </button>
        <LangSwitch variant="pill" />
      </div>
    </div>
  );
}
