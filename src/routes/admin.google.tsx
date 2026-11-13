// Вход через Google (владелец, 29.10.2026) — база, выключено, видно всем админам.
import { createFileRoute } from "@tanstack/react-router";
import { GoogleLoginCard } from "@/components/admin/google/GoogleLoginCard";

export const Route = createFileRoute("/admin/google")({ component: AdminGooglePage });

function AdminGooglePage() {
  return (
    <div className="space-y-4">
      <GoogleLoginCard />
    </div>
  );
}
