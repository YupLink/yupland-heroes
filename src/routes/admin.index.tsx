import { createFileRoute, redirect } from "@tanstack/react-router";

// /admin → /admin/drops. Дашборд-лендинг убран (был бесполезен) — заходим
// сразу на рабочий экран. Баланс сервиса и так есть на /admin/drops.
export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/drops" });
  },
});
