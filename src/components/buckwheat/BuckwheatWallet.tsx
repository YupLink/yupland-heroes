// Ввод и вывод DARAI на ссылке «Короны» (/crown, владелец 08.11.2026: «по кнопке ввода —
// ввод и отправка на кошелёк Героев; вывод тоже оттуда — небольшой доступ к игре с
// вводом и выводом»). Окна — те же, что в Казне: AccountTopUp / AccountWithdraw.
import { useQuery } from "@tanstack/react-query";
import { AccountModal } from "@/components/account/AccountModal";
import { AccountTopUp } from "@/components/account/AccountTopUp";
import { AccountWithdraw } from "@/components/account/AccountWithdraw";
import { getAccountDepositInfo } from "@/server/api/currency/deposit";
import { getSession } from "@/server/api/user-auth";
import { useT } from "@/lib/i18n";

const DARAI = "Darai";
/**
 * Обмен NEAR → DARAI на Rhea Finance (бывший Ref Finance; пул Darai–NEAR №5123 — через него
 * идут все покупки DARAI). Владелец 08.11: «надо на свап, а не на пул». Пару из адреса
 * Rhea подставляет только на главной странице (на /swap — свою по умолчанию).
 */
const DARAI_SWAP_URL = "https://app.rhea.finance/#near|darai.tkn.near";

export function BuckwheatWallet({
  mode,
  onClose,
}: {
  mode: "topup" | "withdraw";
  onClose: () => void;
}) {
  const t = useT();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const info = useQuery({
    queryKey: ["acc-deposit-info", "v2", session.data?.wallet ?? ""],
    queryFn: () => getAccountDepositInfo(),
    enabled: session.data?.accountOpen === true && !!session.data?.wallet,
    staleTime: 5 * 60_000,
  });
  const tokens = info.data?.tokens ?? [];
  return (
    <AccountModal
      title={t(mode === "topup" ? "bw.wallet.topup_title" : "bw.wallet.withdraw_title")}
      onClose={onClose}
    >
      {mode === "topup" ? (
        <>
          <a
            href={DARAI_SWAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-xl border border-gold/40 text-sm font-semibold text-gold hover:bg-gold/10"
          >
            {t("bw.wallet.buy")}
          </a>
          <AccountTopUp tokens={tokens} receiverId={info.data?.receiverId ?? ""} symbol={DARAI} />
        </>
      ) : (
        <AccountWithdraw tokens={tokens} wallets={info.data?.wallets} symbol={DARAI} />
      )}
    </AccountModal>
  );
}
