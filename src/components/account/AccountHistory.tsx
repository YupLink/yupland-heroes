import { isCastleToken } from "@/lib/castleTokenScope";
// История движений своего счёта.
//
// Ключ операции показываем целиком: именно по нему разбирается «списалось
// дважды» и «пополнил, а не пришло». По остатку после каждой строки видно, как
// счёт дошёл до текущего числа.
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getMyAccountHistory } from "@/server/api/currency/deposit";
import { getSession } from "@/server/api/user-auth";

type Row = {
  id: string;
  token: string;
  delta: string;
  kind: string;
  ref: string;
  balance_after: string;
  created_at: string;
};

const KIND: Record<string, string> = {
  acc_deposit: "пополнение",
  acc_reward: "награда",
  ref_sub: "подписка друга",
  acc_spend: "покупка",
  acc_refund: "возврат",
  acc_withdraw: "вывод",
  acc_adjust: "правка",
};

export function AccountHistory({ castleScope = false }: { castleScope?: boolean } = {}) {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const wallet = session.data?.wallet ?? undefined;
  const q = useQuery({
    // Ключ с версией: форма ответа поменялась, а прежний ответ лежит у игрока
    // в localStorage сутки.
    queryKey: ["acc-history", "v2", wallet ?? ""],
    queryFn: () => getMyAccountHistory({ data: { limit: 50 } }),
    enabled: !!wallet,
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rows = ((Array.isArray(q.data?.rows) ? q.data.rows : []) as unknown as Row[]).filter(
    (row) => !castleScope || isCastleToken(row.token),
  );
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/60 bg-secondary/10 px-4 py-6 text-center text-xs text-muted-foreground">
        {castleScope
          ? "Среди последних операций нет движений игровых валют."
          : "Движений пока нет."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/40">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold">Когда</th>
            <th className="px-3 py-2 text-left font-semibold">Что</th>
            <th className="px-3 py-2 text-left font-semibold">Токен</th>
            <th className="px-3 py-2 text-right font-semibold">Движение</th>
            <th className="px-3 py-2 text-right font-semibold">Стало</th>
            <th className="px-3 py-2 text-left font-semibold">Ключ операции</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = Number(r.delta);
            return (
              <tr key={r.id} className="border-b border-border/30 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ru-RU")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-[12px]">
                  {KIND[r.kind] ?? r.kind}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{r.token}</td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums ${
                    delta < 0 ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toLocaleString("ru-RU", { maximumFractionDigits: 8 })}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                  {Number(r.balance_after).toLocaleString("ru-RU", { maximumFractionDigits: 8 })}
                </td>
                <td className="max-w-[280px] truncate px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {r.ref}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
