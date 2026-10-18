// Кнопка «Забрать излишки NEAR»: подключённый в HOT кошелёк снимает свободный
// NEAR со СВОЕГО NFT-контракта (таблица — lib/near/surplusTargets.ts):
// darai_collection.near — с лавки Mintbase, yupland_nfts.near — с YupAI (сумма
// считается по сети, запас 1 NEAR остаётся на контракте). Подписывает сам
// владелец в кошельке; сервер не участвует. Деньги уходят только владельцу контракта.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins, Loader2, X } from "lucide-react";
import { connectForSigning, getConnector } from "@/lib/near-connector";
import { useLang } from "@/lib/i18n";
import {
  SURPLUS_TARGETS,
  contractBalance,
  nearText,
  surplusTargetOf,
  withdrawable,
} from "@/lib/near/surplusTargets";

const SIGNER_KEY = ["surplus-signer"] as const;

async function connected() {
  const c = await getConnector();
  if (!c) return null;
  try {
    const conn = await c.getConnectedWallet();
    return { wallet: conn.wallet, signer: conn.accounts?.[0]?.accountId ?? "" };
  } catch {
    return null;
  }
}

export function ReclaimStorageButton() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const who = useQuery({
    queryKey: SIGNER_KEY,
    queryFn: async () => (await connected())?.signer ?? "",
    enabled: open,
  });
  const target = surplusTargetOf(who.data);
  const bal = useQuery({
    queryKey: ["surplus-balance", target?.contract],
    queryFn: () => contractBalance(target!.contract),
    enabled: open && !!target && target.reserveYocto !== null,
  });
  const shown =
    target?.reserveYocto != null && bal.data
      ? withdrawable(bal.data.free, target.reserveYocto)
      : null;

  const link = useMutation({
    // Только для подписи: игра не переключается на этот кошелёк и не пристёгивает его.
    mutationFn: () => connectForSigning(),
    onSettled: () => void qc.invalidateQueries({ queryKey: SIGNER_KEY }),
  });

  const run = useMutation({
    mutationFn: async () => {
      const conn = await connected();
      const t = surplusTargetOf(conn?.signer);
      if (!conn || !t)
        throw new Error(
          ru ? "Подключи кошелёк владельца контракта" : "Connect the contract owner's wallet",
        );
      let amount: bigint | null = null;
      if (t.reserveYocto !== null) {
        // Сумма — по свежему балансу, но не больше той, что видна на экране.
        amount = withdrawable((await contractBalance(t.contract)).free, t.reserveYocto, shown);
        if (amount <= BigInt(0)) throw new Error(ru ? "Снимать нечего" : "Nothing to withdraw");
      }
      await conn.wallet.signAndSendTransactions({
        transactions: [
          {
            receiverId: t.contract,
            actions: [
              {
                type: "FunctionCall",
                params: {
                  methodName: t.method,
                  args: t.args(amount),
                  gas: t.gas,
                  deposit: t.deposit,
                },
              },
            ],
          },
        ],
      });
      return t.signer;
    },
    onSuccess: (signer) => {
      toast.success(ru ? `Излишки NEAR отправлены на ${signer}` : `Surplus NEAR sent to ${signer}`);
      void qc.invalidateQueries({ queryKey: ["surplus-balance"] });
      setOpen(false);
    },
    onError: (e: Error) => {
      if (/cancel|reject|deny/i.test(e.message))
        toast.error(ru ? "Отменено в кошельке" : "Cancelled in wallet");
      else toast.error(e.message);
    },
  });

  const busy = run.isPending || link.isPending;
  const close = () => !busy && setOpen(false);
  const title = ru ? "Забрать излишки NEAR" : "Withdraw surplus NEAR";
  const canSign =
    !!target && (target.reserveYocto === null || (shown != null && shown > BigInt(0)));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <HandCoins className="h-3.5 w-3.5 text-gold" />
        {title}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-base font-bold">
                <HandCoins className="h-4 w-4 text-gold" />
                {title}
              </div>
              <button
                type="button"
                onClick={close}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {who.isPending ? (
              <Loader2 className="mx-auto my-3 h-5 w-5 animate-spin text-muted-foreground" />
            ) : !target ? (
              <div className="space-y-2 text-xs leading-snug text-muted-foreground">
                <p>
                  {ru ? "Подключён" : "Connected"}:{" "}
                  <code className="font-mono">{who.data || "—"}</code>.{" "}
                  {ru
                    ? "Снимать может только владелец контракта:"
                    : "Only the contract owner can withdraw:"}
                </p>
                <ul className="list-disc pl-4">
                  {SURPLUS_TARGETS.map((t) => (
                    <li key={t.signer}>
                      <code className="font-mono">{t.signer}</code> →{" "}
                      <code className="font-mono">{t.contract}</code>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => link.mutate()}
                  disabled={busy}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground disabled:opacity-50"
                >
                  {link.isPending && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
                  {ru ? "Подключить кошелёк" : "Connect wallet"}
                </button>
              </div>
            ) : (
              <div className="space-y-1 text-xs leading-snug text-muted-foreground">
                <p>
                  <code className="font-mono">{target.contract}</code> →{" "}
                  <code className="font-mono">{target.signer}</code>
                </p>
                {target.reserveYocto === null ? (
                  <p>
                    {ru
                      ? "Сумму считает сам контракт: всё свободное сверх хранилища."
                      : "The contract computes the amount itself."}
                  </p>
                ) : bal.isPending ? (
                  <Loader2 className="my-2 h-4 w-4 animate-spin" />
                ) : bal.data ? (
                  <>
                    <p>
                      {ru ? "На контракте" : "On contract"}: {nearText(bal.data.amount, ru)} NEAR
                    </p>
                    <p>
                      {ru ? "Занято хранилищем" : "Storage"}: {nearText(bal.data.storage, ru)} NEAR
                    </p>
                    <p>
                      {ru ? "Остаётся запас" : "Reserve kept"}: {nearText(target.reserveYocto, ru)}{" "}
                      NEAR
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {ru ? "К выводу" : "To withdraw"}: {nearText(shown ?? BigInt(0), ru)} NEAR
                    </p>
                  </>
                ) : (
                  <p role="alert">
                    {ru
                      ? "Не удалось прочитать баланс контракта"
                      : "Could not read the contract balance"}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => run.mutate()}
                    disabled={busy || !canSign}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {run.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <HandCoins className="h-4 w-4" />
                    )}
                    {ru ? "Забрать и подписать" : "Withdraw and sign"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    disabled={busy}
                    className="rounded-xl border border-border px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
                  >
                    {ru ? "Отмена" : "Cancel"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
