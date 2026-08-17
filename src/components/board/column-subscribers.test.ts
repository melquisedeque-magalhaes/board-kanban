import { describe, expect, it } from "vitest";
import { toggleSubscriber } from "./column-subscribers";

const ana = { id: "u1", name: "Ana", avatarUrl: null };
const bia = { id: "u2", name: "Bia", avatarUrl: null };

describe("toggleSubscriber", () => {
  it("adiciona sem duplicar e remove por id", () => {
    expect(toggleSubscriber([ana], bia, true)).toEqual([ana, bia]);
    expect(toggleSubscriber([ana], ana, true)).toEqual([ana]);
    expect(toggleSubscriber([ana, bia], ana, false)).toEqual([bia]);
  });

  it("mantém os inscritos em ordem de nome pt-BR ao adicionar", () => {
    const alvaro = { id: "u3", name: "Álvaro", avatarUrl: null };

    expect(toggleSubscriber([bia, ana], alvaro, true)).toEqual([alvaro, ana, bia]);
  });
});
