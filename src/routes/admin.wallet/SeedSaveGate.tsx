import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy } from "lucide-react";

export function SeedSaveGate({
  seedPhrase,
  onDone,
}: {
  seedPhrase: string;
  onDone: () => void;
}) {
  const words = seedPhrase.trim().split(/\s+/);
  const [step, setStep] = useState<"show" | "verify">("show");
  const [ask, setAsk] = useState<number[]>([0, 1]);
  useEffect(() => {
    const idx = words.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setAsk(idx.slice(0, 2).sort((a, b) => a - b));
  }, []);
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const ok =
    a1.trim().toLowerCase() === (words[ask[0]] ?? "") &&
    a2.trim().toLowerCase() === (words[ask[1]] ?? "");

  if (step === "show") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-warning" /> Запиши сид-фразу
          </div>
          <p className="mt-1 text-xs">
            Единственный способ восстановить кошелёк, если потеряешь устройство
            или браузер очистит хранилище. Показываем один раз.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-sm sm:grid-cols-3">
            {words.map((w, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="w-5 text-right text-muted-foreground">{i + 1}.</span>
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(seedPhrase); toast.success("Скопировано"); }}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs"
        >
          <Copy className="h-3 w-3" /> Скопировать
        </button>
        <button onClick={() => setStep("verify")} className="w-full rounded-full gradient-gold px-3 py-2 text-sm font-bold text-gold-foreground">
          Я записал — продолжить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-sm font-semibold">Подтверди, что записал</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Сид скрыт. Введи слова под номерами {ask[0] + 1} и {ask[1] + 1} из своей записи.
        </p>
        <div className="mt-3 space-y-2">
          <label className="block">
            <div className="mb-1 text-xs text-muted-foreground">Слово №{ask[0] + 1}</div>
            <input value={a1} onChange={(e) => setA1(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono" placeholder="…" autoFocus />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-muted-foreground">Слово №{ask[1] + 1}</div>
            <input value={a2} onChange={(e) => setA2(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono" placeholder="…" />
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setA1(""); setA2(""); setStep("show"); }} className="rounded-full border border-border bg-card px-3 py-2 text-xs">
          ← Показать сид снова
        </button>
        <button disabled={!ok} onClick={onDone} className="rounded-full gradient-gold px-3 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50">
          Готово
        </button>
      </div>
    </div>
  );
}
