import { describe, it, expect, beforeEach } from "vitest";
import {
  getGameType,
  listGameTypes,
} from "@/competitions/data/game-types";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("competitions game types (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds all six variants in sort order", async () => {
    const types = await listGameTypes();
    expect(types.length).toBe(6);
    expect(types.map((t) => t.id)).toEqual([
      "eight_ball",
      "nine_ball",
      "ten_ball",
      "straight",
      "one_pocket",
      "bank_pool",
    ]);
  });

  it("fetches a specific game type by id", async () => {
    const nine = await getGameType("nine_ball");
    expect(nine).not.toBeNull();
    expect(nine!.default_race_to).toBe(7);
  });
});
