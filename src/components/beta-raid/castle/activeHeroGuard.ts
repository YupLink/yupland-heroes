/** Verify the viewed target immediately before an active-hero operation. */
export async function verifyViewedHero(
  expectedId: string,
  read: () => Promise<{ isSuccess: boolean; data?: { heroId?: string | null } | null }>,
  ru: boolean,
): Promise<void> {
  const latest = await read();
  if (!latest.isSuccess)
    throw new Error(
      ru
        ? "Не удалось проверить активного героя. Повтори попытку."
        : "Unable to verify the active hero. Please retry.",
    );
  if (latest.data?.heroId !== expectedId)
    throw new Error(
      ru
        ? "Активный герой изменился. Открой его снаряжение заново."
        : "The active hero changed. Reopen their equipment.",
    );
}
