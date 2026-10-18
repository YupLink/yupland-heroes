// Простые окна построек замка: Склад, Храм и «окно не назначено».
// Храм и Склад встали на место Таверны и Казны (владелец, 07.10.2026).
/** Склад замка — личный склад с ячейками 1–20 (владелец, 08.10.2026). */
export { CastleWarehouseWindow } from "./warehouse/CastleWarehouse";

/** Храм — пока без своего окна. */
export function CastleUnassigned({ ru }: { ru: boolean }) {
  return (
    <p>
      {ru
        ? "Для этой постройки ещё не назначено окно. В редакторе открой её настройки и выбери «Окно постройки»."
        : "This building has no assigned screen. Choose one in its editor settings."}
    </p>
  );
}

/** Вход из редактора: предупреждение, что окна — на настоящих данных. */
export function CastleIntro({ ru, onAccept }: { ru: boolean; onAccept: () => void }) {
  return (
    <section className="m-auto max-w-lg space-y-4 overflow-auto p-5 pt-24">
      <h1 className="text-xl font-bold">{ru ? "Оригинальные окна игры" : "Original game screens"}</h1>
      <p>
        {ru
          ? "Здесь используются твой игровой аккаунт и его настоящие данные. Покупки, распаковка, улучшения и получение наград выполняют реальные действия. Окна сохраняют автоматическую обработку ожидающих платежей, как в игре. Просмотр героев не меняет активного героя."
          : "These screens use your game account and real data. Purchases, opening packs, upgrades and claiming rewards are real actions. Original automatic payment reconciliation remains enabled. Viewing a hero does not change your active hero."}
      </p>
      <button data-game-button="secondary" className="min-h-11 rounded-xl border p-3" onClick={onAccept}>
        {ru ? "Открыть игровые окна" : "Open game screens"}
      </button>
    </section>
  );
}
