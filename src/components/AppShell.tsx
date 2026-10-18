import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { TelegramLoginModal } from "./auth/TelegramLoginModal";
import { FairplayModal } from "./FairplayModal";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { useLocation } from "@tanstack/react-router";
import { getSession } from "@/server/api/user-auth";
import { useLangSync } from "@/lib/langPrefs";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
}) {
  const [walletOpen, setWalletOpen] = useState(false);
  const location = useLocation();
  // Прихожа/админка — фокус-экраны без нижней навигации.
  const noNav = hideNav || location.pathname.startsWith("/admin");
  // Подхватываем сохранённый в БД язык аккаунта (кросс-девайс «навсегда»).
  useLangSync();

  // Maintenance gate: если MAINTENANCE_MODE=true и юзер не админ →
  // показываем «системные работы». Загружаем сессию в любом случае.
  // Пока сессия грузится — показываем maintenance тоже (consitive default),
  // чтобы юзер не успел кликнуть до того как мы поймём что он не админ.
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    staleTime: 30_000,
  });
  const maintenanceMode = session.data?.maintenanceMode ?? false;
  const isAdmin = session.data?.isAdmin ?? false;
  if (maintenanceMode && !isAdmin) {
    return <MaintenanceScreen />;
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-40" />
      <AppHeader onConnectClick={() => setWalletOpen(true)} />
      {/* BottomNav теперь position:fixed — резервируем место снизу чтобы
          контент последней секции не уходил под него. */}
      <main className={noNav ? "flex-1" : "flex-1 pb-[calc(64px+env(safe-area-inset-bottom))]"}>
        {children}
      </main>
      {!noNav && <BottomNav />}
      <TelegramLoginModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      <FairplayModal />
    </div>
  );
}
