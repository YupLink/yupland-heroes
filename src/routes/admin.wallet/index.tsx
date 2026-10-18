import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { MyWalletSection } from "./MyWalletSection";
import { AllUsersWalletsSection } from "./AllUsersWalletsSection";

export const Route = createFileRoute("/admin/wallet/")({
  head: () => ({ meta: [{ title: "YupLink Wallet — admin" }] }),
  component: AdminWalletPage,
});

function AdminWalletPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-success/30 bg-success/5 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-success" />
          Non-custodial
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Бэк хранит только public_key + account_id. Приваты юзеров — в их
          localStorage браузера (опц. зашифровано PIN). Подписать за юзера
          никто (включая нас) не может.
        </p>
      </div>
      <MyWalletSection />
      <AllUsersWalletsSection />
    </div>
  );
}

export { MyWalletSection } from "./MyWalletSection";
export { CreateForm } from "./CreateForm";
export { ImportForm } from "./ImportForm";
export { SeedSaveGate } from "./SeedSaveGate";
