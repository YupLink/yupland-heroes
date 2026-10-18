import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg } from "../db/pg";
import { requireAdmin } from "../auth";

export const listTasks = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const rows = await pg.tasks.findMany(
    { active: true },
    { orderBy: { column: "created_at", ascending: false } }
  );
  const allCompletions = await pg.taskCompletions.findMany();
  const map = new Map<string, number>();
  for (const c of allCompletions) {
    map.set(c.task_id, (map.get(c.task_id) ?? 0) + 1);
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    image: r.image,
    target: r.target,
    active: r.active,
    createdAt: r.created_at,
    completions: map.get(r.id) ?? 0,
  }));
});

export const createTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["tg_channel", "custom"]),
        title: z.string().min(1).max(200),
        image: z
          .string()
          .min(1)
          .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
            message: "Ожидается путь /uploads/... или http(s)-URL",
          })
          .nullable()
          .optional(),
        target: z.string().max(500).nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const id = `t_${nanoid(8)}`;
    await pg.tasks.insert({
      id,
      kind: data.kind,
      title: data.title,
      image: data.image ?? null,
      target: data.target ?? null,
      description: data.description ?? null,
      active: true,
    });
    return { id };
  });

export const updateTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1),
        title: z.string().min(1).max(200),
        image: z
          .string()
          .min(1)
          .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
            message: "Ожидается путь /uploads/... или http(s)-URL",
          })
          .nullable()
          .optional(),
        target: z.string().max(500).nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.tasks.update(
      { id: data.id },
      {
        title: data.title,
        image: data.image ?? null,
        target: data.target ?? null,
        description: data.description ?? null,
        ...(data.active !== undefined ? { active: data.active } : {}),
      }
    );
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    requireAdmin();
    await pg.tasks.update({ id: data.id }, { active: false });
    return { ok: true };
  });
