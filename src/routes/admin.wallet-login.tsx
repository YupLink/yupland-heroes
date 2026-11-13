// Вход по кошельку (владелец, 06.11.2026) — статистика и совпадения для проверки.
import { createFileRoute } from "@tanstack/react-router";
import { WalletLoginCard } from "@/components/admin/wallet-login/WalletLoginCard";

export const Route = createFileRoute("/admin/wallet-login")({ component: AdminWalletLoginPage });

function AdminWalletLoginPage() {
  return (
    <div className="space-y-4">
      <WalletLoginCard />
    </div>
  );
}
