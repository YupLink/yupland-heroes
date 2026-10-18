import { createFileRoute } from "@tanstack/react-router";
import { AdminDrops } from "./AdminDrops";

export const Route = createFileRoute("/admin/drops/")({
  component: AdminDrops,
});
