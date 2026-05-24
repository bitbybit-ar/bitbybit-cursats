import { describe, it, expect } from "vitest";
import {
  ORDERS_PAGE_SIZE,
  buildOrdersHref,
  ordersHasActiveFilters,
  parseOrdersParams,
} from "@/lib/orders-params";
import { orderDisplayStatus } from "@/lib/creator/orders";

describe("parseOrdersParams", () => {
  it("returns defaults when nothing is passed", () => {
    expect(parseOrdersParams(undefined)).toEqual({
      course: "",
      status: "all",
      page: 1,
    });
  });

  it("whitelists status; drops unknown values", () => {
    expect(parseOrdersParams({ status: "settling" }).status).toBe("settling");
    expect(parseOrdersParams({ status: "junk" }).status).toBe("all");
  });

  it("accepts a kebab-case course slug and rejects junk", () => {
    expect(parseOrdersParams({ course: "intro-piano" }).course).toBe(
      "intro-piano"
    );
    expect(parseOrdersParams({ course: "Bad Slug!" }).course).toBe("");
  });

  it("clamps page to >= 1 and caps it at 1000", () => {
    expect(parseOrdersParams({ page: "3" }).page).toBe(3);
    expect(parseOrdersParams({ page: "0" }).page).toBe(1);
    expect(parseOrdersParams({ page: "nope" }).page).toBe(1);
    expect(parseOrdersParams({ page: "999999999" }).page).toBe(1000);
  });

  it("reads the first value when a key arrives as an array", () => {
    expect(parseOrdersParams({ status: ["settled", "failed"] }).status).toBe(
      "settled"
    );
  });
});

describe("buildOrdersHref", () => {
  it("returns the bare /orders when nothing is set", () => {
    expect(buildOrdersHref(parseOrdersParams(undefined))).toBe("/orders");
  });

  it("omits defaults and encodes only non-default values", () => {
    const params = parseOrdersParams({
      course: "intro-piano",
      status: "settling",
      page: "2",
    });
    const href = buildOrdersHref(params);
    expect(href.startsWith("/orders?")).toBe(true);
    expect(href).toContain("course=intro-piano");
    expect(href).toContain("status=settling");
    expect(href).toContain("page=2");
  });

  it("applies the patch on top of the current params", () => {
    const params = parseOrdersParams({ status: "settling", page: "2" });
    expect(buildOrdersHref(params, { page: 3 })).toContain("page=3");
    expect(buildOrdersHref(params, { status: "all" })).not.toContain("status=");
  });
});

describe("ordersHasActiveFilters", () => {
  it("is false for defaults and true for any deviation", () => {
    expect(ordersHasActiveFilters(parseOrdersParams(undefined))).toBe(false);
    expect(ordersHasActiveFilters(parseOrdersParams({ status: "paid" }))).toBe(
      true
    );
    expect(
      ordersHasActiveFilters(parseOrdersParams({ course: "intro-piano" }))
    ).toBe(true);
  });
});

describe("orderDisplayStatus", () => {
  it("labels an unpaid order as pending payment", () => {
    expect(
      orderDisplayStatus({
        status: "pending",
        rail: "wapu_ars",
        payout_status: null,
      })
    ).toEqual({ key: "pendingPayment", tone: "pending" });
  });

  it("walks the wapu_ars payout leg", () => {
    const base = { status: "paid", rail: "wapu_ars" } as const;
    expect(orderDisplayStatus({ ...base, payout_status: null }).key).toBe(
      "withdrawalPending"
    );
    expect(orderDisplayStatus({ ...base, payout_status: "pending" }).key).toBe(
      "settling"
    );
    expect(orderDisplayStatus({ ...base, payout_status: "released" })).toEqual({
      key: "settled",
      tone: "paid",
    });
    expect(orderDisplayStatus({ ...base, payout_status: "failed" })).toEqual({
      key: "settlementFailed",
      tone: "failed",
    });
  });

  it("labels a paid direct_lightning order as paid", () => {
    expect(
      orderDisplayStatus({
        status: "paid",
        rail: "direct_lightning",
        payout_status: null,
      })
    ).toEqual({ key: "paid", tone: "paid" });
  });

  it("labels failed and refunded orders", () => {
    expect(
      orderDisplayStatus({
        status: "failed",
        rail: "wapu_ars",
        payout_status: null,
      }).key
    ).toBe("failed");
    expect(
      orderDisplayStatus({
        status: "refunded",
        rail: "wapu_ars",
        payout_status: null,
      })
    ).toEqual({ key: "refunded", tone: "refunded" });
  });
});

describe("ORDERS_PAGE_SIZE", () => {
  it("is a positive integer", () => {
    expect(ORDERS_PAGE_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(ORDERS_PAGE_SIZE)).toBe(true);
  });
});
