// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildSettingsAuthEvent,
  hashSettingsBody,
  SETTINGS_ACTION_TAG,
} from "@/lib/admin/sign-settings-payload";

function findTag(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

describe("admin/sign-settings-payload", () => {
  it("hashSettingsBody matches a node sha256 of the same bytes", async () => {
    const serialized = JSON.stringify({
      cbu: "0000003100000000000001",
      alias: null,
      features_autorenewal: true,
    });
    const expected = createHash("sha256").update(serialized).digest("hex");
    const actual = await hashSettingsBody(serialized);
    expect(actual).toBe(expected);
  });

  it("hashSettingsBody is deterministic across calls", async () => {
    const a = await hashSettingsBody("hello");
    const b = await hashSettingsBody("hello");
    expect(a).toBe(b);
  });

  it("buildSettingsAuthEvent pins kind 27235 and the canonical tags", () => {
    const url = "https://cursats.test/api/settings";
    const payloadHash = "abcd".repeat(16);
    const event = buildSettingsAuthEvent(url, payloadHash);

    expect(event.kind).toBe(27235);
    expect(event.content).toBe("");
    expect(findTag(event.tags, "u")).toBe(url);
    expect(findTag(event.tags, "method")).toBe("PATCH");
    expect(findTag(event.tags, "payload")).toBe(payloadHash);
    expect(findTag(event.tags, "cursats_action")).toBe(SETTINGS_ACTION_TAG);
  });

  it("buildSettingsAuthEvent stamps a current created_at within a few seconds", () => {
    const before = Math.floor(Date.now() / 1000);
    const event = buildSettingsAuthEvent(
      "https://cursats.test",
      "0".repeat(64)
    );
    const after = Math.floor(Date.now() / 1000);
    expect(event.created_at).toBeGreaterThanOrEqual(before);
    expect(event.created_at).toBeLessThanOrEqual(after + 1);
  });
});
