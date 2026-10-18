// YUPLINK · Модалка подтверждения рассылки DARAI. Логика та же, что была в
// панели: закрыть можно кликом по фону, отправить — только вручную введя
// слово-подтверждение. Вынесено ради размера файла панели, поведение не
// менялось.

import { Loader2, Send, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./daraiPayoutShared";

export const CONFIRM_WORD = "РАЗОСЛАТЬ";

export function DaraiDistributeConfirm({
  recipients,
  totalHuman,
  pending,
  input,
  onInput,
  onClose,
  onConfirm,
}: {
  recipients: number;
  totalHuman: number;
  pending: boolean;
  input: string;
  onInput: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-rose-500/60 bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-rose-300">
            <ShieldAlert className="h-5 w-5" /> Подтвердить рассылку
          </div>
          <button
            type="button"
            onClick={() => {
              if (!pending) onClose();
            }}
            className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-[11px] leading-relaxed text-rose-100">
          Будет создан батч-запрос на <b>{recipients}</b> получателей, всего{" "}
          <b>{fmt(totalHuman)} DARAI</b>. Это реальный перевод средств — отмене
          не подлежит после approve в TG.
        </div>
        <label className="block text-[11px] text-muted-foreground">
          Для подтверждения введите слово{" "}
          <span className="font-mono font-bold text-rose-300">
            {CONFIRM_WORD}
          </span>
        </label>
        <input
          autoFocus
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder={CONFIRM_WORD}
          className="mt-1 w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 font-mono text-sm uppercase tracking-widest"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={pending || input.trim().toUpperCase() !== CONFIRM_WORD}
            onClick={onConfirm}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white transition",
              "bg-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:bg-rose-400",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Разослать средства
          </button>
        </div>
      </div>
    </div>
  );
}
