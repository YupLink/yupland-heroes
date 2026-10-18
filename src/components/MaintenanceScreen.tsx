// Полноэкранный экран «системные работы». Включается через env-флаг
// MAINTENANCE_MODE=true (см. getSession в src/server/api/user.ts).
// Админы экран не видят — у них всё работает как обычно.

import { Wrench } from "lucide-react";

export function MaintenanceScreen() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-30" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12),transparent_60%)]" />

      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gold/40 bg-gold/10 shadow-gold">
        <Wrench className="h-10 w-10 text-gold" />
      </div>

      <h1 className="font-display text-4xl font-bold uppercase leading-tight tracking-wider sm:text-6xl md:text-7xl">
        <span className="text-gradient-gold">СИСТЕМНЫЕ</span>
        <br />
        <span className="text-gradient-gold">РАБОТЫ</span>
      </h1>

      <p className="mt-6 max-w-md text-sm uppercase tracking-widest text-muted-foreground sm:text-base">
        Обновляем систему. Скоро вернёмся.
      </p>

      <p className="mt-2 max-w-md text-xs text-muted-foreground/70">
        Покупки, открытия паков и крафт временно недоступны.
      </p>
    </div>
  );
}
