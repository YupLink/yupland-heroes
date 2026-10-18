// Три вещи, которые надо увидеть раньше таблицы.
//
// Про сверку старого учёта здесь ничего нет сознательно: она про внутреннюю
// таблицу, которая к счёту отношения не имеет, и о расхождениях уже сообщает
// часовой крон в Телеграм.
import { AlertTriangle, Fuel, Hourglass } from "lucide-react";

/** Ниже этого выплаты начнут упираться в газ, а не в токены. */
const NEAR_LOW = 1;

export function TreasuryHeadline({
  alerts,
  waiting,
  near,
  wallet,
}: {
  alerts: string[];
  waiting: string[];
  near: number | null;
  wallet: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card
        icon={<Hourglass className="h-4 w-4" />}
        title="Ждёт зачисления"
        tone="info"
        value={waiting.length ? `${waiting.length} токенов` : "всё зачислено"}
        note={
          waiting.length
            ? `Награды ещё не на счетах: ${waiting.slice(0, 4).join(", ")}`
            : "Награды и счета сведены"
        }
      />
      <Card
        icon={<Fuel className="h-4 w-4" />}
        title="Газ подписанта"
        tone={near !== null && near < NEAR_LOW ? "bad" : "ok"}
        value={near === null ? "—" : `${near.toFixed(3)} NEAR`}
        note={wallet}
      />
      <Card
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Покрытие резервом"
        tone={alerts.length ? "bad" : "ok"}
        value={alerts.length ? `не хватает: ${alerts.join(", ")}` : "хватает на всё"}
        note={
          alerts.length
            ? "Обязательства больше остатков на обоих кошельках"
            : "Остатков хватает на всё, что должны"
        }
      />
    </div>
  );
}

function Card({
  icon,
  title,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  note: string;
  tone: "ok" | "bad" | "info";
}) {
  const bad = tone === "bad";
  return (
    <div
      className={`rounded-2xl border p-4 ${
        bad ? "border-red-500/30 bg-red-500/5" : "border-border/60 bg-card/40"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${
          bad ? "text-red-400" : "text-muted-foreground"
        }`}
      >
        {icon}
        {title}
      </div>
      <div
        className={`mt-1 font-mono text-lg font-bold tabular-nums ${
          bad ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{note}</div>
    </div>
  );
}
