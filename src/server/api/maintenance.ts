import { createServerFn } from "@tanstack/react-start";
import { getMaintenanceState } from "../maintenance";

// Публичный (негейтящийся) статус сервисных работ — фронт показывает оверлей.
export const getMaintenanceStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    return await getMaintenanceState();
  }
);
