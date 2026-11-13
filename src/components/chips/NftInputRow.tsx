// Строка списка «ввести NFT»: превью, счётчик ×N, регулятор количества и
// кнопка. Вынесена из NftInputModal, чтобы модалка осталась ≤250 строк.
//
// Количество можно вписать цифрами (жалоба игрока 29.09: из 112 до 10 — сто два
// нажатия «−»). Поле держит черновик: пока вписываешь, промежуточное «1» от «10»
// не мешает; вне пределов — прижимается к 1…максимум при выходе из поля.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MAX_NFT_BATCH } from "./nft-input-shared";
import type { NftGroup } from "./useNftGroups";

import { thumb } from "@/lib/image";
export function NftInputRow({
  group,
  qty,
  selected,
  busy,
  onToggle,
  onQty,
  onDeposit,
}: {
  group: NftGroup;
  qty: number;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onQty: (n: number) => void;
  onDeposit: () => void;
}) {
  const t = useT();
  const nft = group.sample;
  const count = group.tokens.length;
  const maxQty = Math.min(count, MAX_NFT_BATCH);
  const [draft, setDraft] = useState(String(qty));
  useEffect(() => setDraft(String(qty)), [qty]);
  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    const v = Number.isFinite(n) ? Math.max(1, Math.min(n, maxQty)) : qty;
    if (v !== qty) onQty(v);
    setDraft(String(v));
  };

  return (
    <div className="nft-input-row flex items-center gap-3 rounded-xl p-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => !busy && onToggle()}
        disabled={busy}
        className="h-4 w-4 shrink-0 accent-[#f3ca62] disabled:opacity-40"
      />
      <div className="relative shrink-0">
        {nft.imageUrl ? (
          <img src={thumb(nft.imageUrl, 96)} alt="" className="h-11 w-11 rounded-lg object-cover" />
        ) : (
          <div className="h-11 w-11 rounded-lg bg-secondary" />
        )}
        {count > 1 && (
          <span className="nft-input-row-count absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold leading-tight">
            ×{count}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold">{group.mainTitle}</span>
          {count > 1 && (
            <span className="nft-input-row-quantity shrink-0 rounded px-1 text-[10px] font-bold">
              {t("chips.pcs_n", { n: count })}
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-[#e7cf92]">{group.subtitle}</div>
      </div>
      {count > 1 && (
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background/60 p-0.5">
          <button
            type="button"
            disabled={busy || qty <= 1}
            onClick={() => onQty(qty - 1)}
            aria-label={t("chips.less")}
            className="grid h-6 w-6 place-items-center rounded-md text-sm font-bold text-[#f3ca62] transition hover:bg-[#f3ca62]/10 disabled:opacity-30"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            disabled={busy}
            aria-label={t("chips.qty")}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
              setDraft(digits);
              const n = parseInt(digits, 10);
              if (Number.isFinite(n) && n >= 1 && n <= maxQty) onQty(n);
            }}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-9 rounded bg-transparent text-center font-mono text-xs font-bold tabular-nums outline-none focus:bg-[#f3ca62]/10 disabled:opacity-40"
          />
          <button
            type="button"
            disabled={busy || qty >= maxQty}
            onClick={() => onQty(qty + 1)}
            aria-label={t("chips.more")}
            className="grid h-6 w-6 place-items-center rounded-md text-sm font-bold text-[#f3ca62] transition hover:bg-[#f3ca62]/10 disabled:opacity-30"
          >
            +
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onDeposit}
        className="nft-input-primary inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {count > 1 ? t("chips.enter_n", { n: qty }) : t("chips.enter")}
      </button>
    </div>
  );
}
