import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import { createEmbeddedWallet } from "@/lib/embeddedWallet";
import { registerEmbeddedWallet } from "@/server/api/embedded";
import { getSession } from "@/server/api/user-auth";
import { signedConnect } from "@/lib/signedConnect";
import { SeedSaveGate } from "./SeedSaveGate";
import { humanError } from "@/lib/humanError";

export function CreateForm({
  onDone,
  onCancel,
}: {
  onDone: (accountId: string) => void;
  onCancel: () => void;
}) {
  const [created, setCreated] = useState<{
    accountId: string;
    seedPhrase: string;
  } | null>(null);

  // Админ (кошелёк-менеджер проекта) хранит кошельки без пристёгивания к своему
  // Telegram — сервер это разрешает только ему (embedded.ts).
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = session.data?.isAdmin === true;

  const mut = useMutation({
    mutationFn: async () => {
      const w = await createEmbeddedWallet();
      // Кошелёк пристёгивается к Telegram только подписью (18.10.2026); игра
      // остаётся на текущем. Не вышло — сид всё равно показываем: ключ уже на
      // устройстве, без сохранённого сида он потерялся бы.
      try {
        if (!admin) await signedConnect({ accountId: w.accountId, kind: "embedded", stay: true });
        await registerEmbeddedWallet({
          data: { accountId: w.accountId, publicKey: w.publicKey },
        });
      } catch (e) {
        toast.error(humanError(e as Error));
      }
      return w;
    },
    onSuccess: (w) => setCreated({ accountId: w.accountId, seedPhrase: w.seedPhrase }),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (created) {
    return (
      <SeedSaveGate seedPhrase={created.seedPhrase} onDone={() => onDone(created.accountId)} />
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="space-y-3"
    >
      <p className="text-xs text-muted-foreground">
        Сгенерируем NEAR-аккаунт в браузере. Ключ останется только на этом устройстве.
      </p>
      <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[11px] text-success">
        <Shield className="mr-1 inline h-3 w-3" />
        Ключ ляжет в защищённое хранилище браузера — скопировать его с устройства нельзя. PIN не
        нужен.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={mut.isPending}
          className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Создать
        </button>
      </div>
    </form>
  );
}
