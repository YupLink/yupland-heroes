// Паспорт аккаунта (владелец, 06.11.2026): Telegram, кошельки и Google каждого аккаунта.
import { createFileRoute } from "@tanstack/react-router";
import { PassportCard } from "@/components/admin/passport/PassportCard";

export const Route = createFileRoute("/admin/passport")({ component: AdminPassportPage });

function AdminPassportPage() {
  return (
    <div className="space-y-4">
      <PassportCard />
    </div>
  );
}
