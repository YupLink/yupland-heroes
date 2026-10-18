// Список тестеров: добавить кошелёк, убрать кошелёк.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminAddTester, adminRemoveTester } from "@/server/api/testers-admin";
import { humanError } from "@/lib/humanError";

type Tester = { wallet: string; note: string | null; added_at: string };

export function TesterList({ testers }: { testers: Tester[] }) {
  const qc = useQueryClient();
  const [wallet, setWallet] = useState("");
  const [note, setNote] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-testers"] });

  const add = useMutation({
    mutationFn: () => adminAddTester({ data: { wallet: wallet.trim(), note: note.trim() } }),
    onSuccess: (r) => {
      toast.success(`Добавлен ${r.wallet}`);
      setWallet("");
      setNote("");
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const remove = useMutation({
    mutationFn: (w: string) => adminRemoveTester({ data: { wallet: w } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="кошелёк (напр. player.tg)"
          className="min-w-[180px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="заметка"
          className="min-w-[120px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => wallet.trim() && add.mutate()}
          disabled={add.isPending || !wallet.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {add.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Добавить
        </button>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        {testers.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">Пока никого нет.</p>
        )}
        {testers.map((t) => (
          <div key={t.wallet} className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm">{t.wallet}</div>
              {t.note && <div className="truncate text-[11px] text-muted-foreground">{t.note}</div>}
            </div>
            <button
              onClick={() => remove.mutate(t.wallet)}
              disabled={remove.isPending}
              className="rounded-lg p-2 text-rose-400 transition hover:bg-rose-400/10 disabled:opacity-50"
              title="Убрать из тестеров"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
