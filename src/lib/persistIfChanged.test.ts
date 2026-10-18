// Персист пишет кэш, только когда данные правда посвежели: повтор опроса с
// тем же ответом и оптимистичный шаг (прежняя метка) записи не будят.
import { describe, expect, it, vi } from "vitest";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { persistIfChanged } from "@/lib/persistIfChanged";

type Q = { hash: string; at: number; data: unknown };

const client = (qs: Q[]): PersistedClient =>
  ({
    buster: "v1",
    timestamp: 0,
    clientState: {
      mutations: [],
      queries: qs.map((q) => ({
        queryHash: q.hash,
        queryKey: [q.hash],
        state: { dataUpdatedAt: q.at, data: q.data },
      })),
    },
  }) as unknown as PersistedClient;

function setup() {
  const persistClient = vi.fn();
  const base = { persistClient, restoreClient: vi.fn(), removeClient: vi.fn() } as Persister;
  return { p: persistIfChanged(base), persistClient };
}

describe("persistIfChanged", () => {
  it("первый снимок пишется, тот же ответ после опроса — нет", () => {
    const { p, persistClient } = setup();
    const energy = { energy: 5 };
    p.persistClient(client([{ hash: "e", at: 1, data: energy }]));
    p.persistClient(client([{ hash: "e", at: 2, data: energy }]));
    expect(persistClient).toHaveBeenCalledTimes(1);
  });

  it("оптимистичный шаг с прежней меткой не пишет, ответ сервера — пишет", () => {
    const { p, persistClient } = setup();
    p.persistClient(client([{ hash: "s", at: 1, data: { q: 1 } }]));
    p.persistClient(client([{ hash: "s", at: 1, data: { q: 2 } }]));
    expect(persistClient).toHaveBeenCalledTimes(1);
    p.persistClient(client([{ hash: "s", at: 3, data: { q: 2 } }]));
    expect(persistClient).toHaveBeenCalledTimes(2);
  });

  it("новый или ушедший запрос — запись", () => {
    const { p, persistClient } = setup();
    const a = { hash: "a", at: 1, data: 1 };
    p.persistClient(client([a]));
    p.persistClient(client([a, { hash: "b", at: 1, data: 2 }]));
    p.persistClient(client([a]));
    expect(persistClient).toHaveBeenCalledTimes(3);
  });

  it("простые значения сравниваются по значению", () => {
    const { p, persistClient } = setup();
    p.persistClient(client([{ hash: "n", at: 1, data: 7 }]));
    p.persistClient(client([{ hash: "n", at: 2, data: 7 }]));
    p.persistClient(client([{ hash: "n", at: 3, data: 8 }]));
    expect(persistClient).toHaveBeenCalledTimes(2);
  });
});
