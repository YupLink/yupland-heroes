// Шапка ссылки «Короны» (/crown, владелец 08.11.2026): балансы золота и DARAI в правом
// верхнем углу — видно, как меняются после партии, — и ввод/вывод DARAI. Только на
// ссылке: в постройке внутри игры шапки нет.
import { useEffect, useState, type RefObject } from "react";
import { useResources } from "@/lib/hooks/useResources";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";
import { useLang, useT } from "@/lib/i18n";
import { useEntryRules } from "@/hooks/useEntryRules";
import { BuckwheatWallet } from "./BuckwheatWallet";

const BTN =
  "min-h-9 rounded-lg border border-[#ffd481]/60 px-3 text-xs font-bold text-[#ffe1a0] hover:bg-[#ffd481]/10";

export function CrownBar({ frame }: { frame: RefObject<HTMLIFrameElement | null> }) {
  const t = useT();
  const ru = useLang() === "ru";
  const gold = useResources().data?.gold ?? 0;
  const darai =
    useAccountBalances().data?.balances.find((b) => b.token.toLowerCase() === "darai")?.balance ??
    0;
  const [wallet, setWallet] = useState<"topup" | "withdraw" | null>(null);
  // Вывод: «Корона» (введённое + 10 %) и белый список; остальным кнопки нет (§8.127).
  const canWithdraw = useEntryRules().canWithdraw;
  // DARAI поменялись (зачли ввод, ушёл вывод) — окно игры перечитает свой счёт.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ bw: "refresh" }, window.location.origin);
  }, [frame, darai, wallet]);
  const fmt = (v: number) => Math.floor(v).toLocaleString(ru ? "ru-RU" : "en-US");
  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-end gap-2 bg-[#111313] px-3 text-[#ffe1a0]">
        <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
          <img src="/resources/gold.webp" alt={t("bw.stats.gold")} className="h-5 w-5" />
          {fmt(gold)}
        </span>
        <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
          <img src="/resources/darai.webp" alt="DARAI" className="h-5 w-5" />
          {fmt(darai)}
        </span>
        <button type="button" className={BTN} onClick={() => setWallet("topup")}>
          {t("bw.wallet.topup")}
        </button>
        {canWithdraw && (
          <button type="button" className={BTN} onClick={() => setWallet("withdraw")}>
            {t("bw.wallet.withdraw")}
          </button>
        )}
      </div>
      {wallet && <BuckwheatWallet mode={wallet} onClose={() => setWallet(null)} />}
    </>
  );
}
