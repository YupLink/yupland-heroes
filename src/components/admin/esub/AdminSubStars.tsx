// Звёзды: пул подписок и пополнения игроков — раздельно. Звёзды подписок
// просто копятся (владелец, 29.09): ни вывода, ни трат отсюда нет.
import type { StarsStats } from "@/server/api/energy-sub/buckets";
import { fmt } from "./AdminSubMoney";

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{fmt(value)} ⭐</span>
    </div>
  );
}

export function AdminSubStars({ stars }: { stars: StarsStats }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold">Звёзды</h2>
      <div className="grid gap-2 text-[12px] sm:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-border bg-card p-3">
          <div className="font-semibold">Пул подписок</div>
          <Row label="Пришло" value={stars.subIn} />
          <Row label="В пуле" value={stars.subLeft} />
        </div>
        <div className="space-y-1 rounded-xl border border-border bg-card p-3">
          <div className="font-semibold">Пополнения игроков</div>
          <Row label="Пришло" value={stars.depositsIn} />
          <Row label="На счетах" value={stars.onAccounts} />
        </div>
      </div>
    </section>
  );
}
