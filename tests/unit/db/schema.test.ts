import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  users,
  offerings,
  orders,
  adminAuditLog,
  offeringType,
  orderStatus,
} from "@/lib/db/schema";

describe("db/schema enums", () => {
  it("offering type covers code and download", () => {
    expect(offeringType.enumValues).toEqual(["code", "download"]);
  });

  it("order status covers the lifecycle", () => {
    expect(orderStatus.enumValues).toEqual([
      "pending",
      "paid",
      "failed",
      "refunded",
    ]);
  });
});

describe("db/schema users", () => {
  const config = getTableConfig(users);

  it("uses snake_case table name", () => {
    expect(config.name).toBe("users");
  });

  it("requires pubkey, slug, and display_name", () => {
    for (const name of ["pubkey", "slug", "display_name"]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col?.notNull, `${name} should be NOT NULL`).toBe(true);
    }
  });

  it("makes pubkey and slug unique (one row per identity, one row per URL)", () => {
    const pubkey = config.columns.find((c) => c.name === "pubkey");
    const slug = config.columns.find((c) => c.name === "slug");
    expect(pubkey?.isUnique).toBe(true);
    expect(slug?.isUnique).toBe(true);
  });

  it("defaults active to true on insert", () => {
    const active = config.columns.find((c) => c.name === "active");
    expect(active?.default).toBe(true);
    expect(active?.notNull).toBe(true);
  });

  it("makes cbu and alias nullable so a fresh row can render the panel", () => {
    for (const name of ["cbu", "alias"]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col?.notNull, `${name} should be nullable`).toBe(false);
    }
  });
});

describe("db/schema offerings", () => {
  const config = getTableConfig(offerings);

  it("uses snake_case table name", () => {
    expect(config.name).toBe("offerings");
  });

  it("requires user_id (per ADRs 0012, 0016)", () => {
    const userId = config.columns.find((c) => c.name === "user_id");
    expect(userId?.notNull).toBe(true);
  });

  it("makes archived_at nullable for soft-delete", () => {
    const archivedAt = config.columns.find((c) => c.name === "archived_at");
    expect(archivedAt?.notNull).toBe(false);
  });

  it("requires title, description, price_amount, and price_currency", () => {
    for (const name of [
      "title",
      "description",
      "price_amount",
      "price_currency",
    ]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col?.notNull, `${name} should be NOT NULL`).toBe(true);
    }
  });

  it("references users via user_id", () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id")
    );
    expect(fk).toBeDefined();
  });
});

describe("db/schema orders", () => {
  const config = getTableConfig(orders);

  it("makes pubkey nullable so anonymous orders are valid", () => {
    const pubkey = config.columns.find((c) => c.name === "pubkey");
    expect(pubkey?.notNull).toBe(false);
  });

  it("requires offering_id, user_id, and the amounts", () => {
    for (const name of [
      "offering_id",
      "user_id",
      "amount_ars",
      "amount_sats",
    ]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col?.notNull, `${name} should be NOT NULL`).toBe(true);
    }
  });

  it("defaults status to pending", () => {
    const status = config.columns.find((c) => c.name === "status");
    expect(status?.default).toBe("pending");
  });

  it("references offerings via offering_id", () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "offering_id")
    );
    expect(fk).toBeDefined();
  });

  it("references users via user_id", () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === "user_id")
    );
    expect(fk).toBeDefined();
  });

  it("carries the two-leg Wapu tx ids + payout columns (ADR 0025)", () => {
    for (const name of [
      "wapu_deposit_tx_id",
      "wapu_withdrawal_tx_id",
      "payout_status",
      "payout_released_at",
      "amount_usdt",
      "transfer_speed",
    ]) {
      expect(
        config.columns.find((c) => c.name === name),
        `${name} should exist`
      ).toBeDefined();
    }
    // Old single-leg names are gone.
    expect(
      config.columns.find((c) => c.name === "wapu_tentative_uuid")
    ).toBeUndefined();
    expect(
      config.columns.find((c) => c.name === "wapu_settlement_ref")
    ).toBeUndefined();
  });
});

describe("db/schema admin_audit_log", () => {
  const config = getTableConfig(adminAuditLog);

  it("requires actor_pubkey, route, and action", () => {
    for (const name of ["actor_pubkey", "route", "action"]) {
      const col = config.columns.find((c) => c.name === name);
      expect(col?.notNull, `${name} should be NOT NULL`).toBe(true);
    }
  });

  it("makes user_id nullable for platform-level audit rows", () => {
    const m = config.columns.find((c) => c.name === "user_id");
    expect(m?.notNull).toBe(false);
  });

  it("makes payload_diff nullable so non-mutating audits can omit it", () => {
    const diff = config.columns.find((c) => c.name === "payload_diff");
    expect(diff?.notNull).toBe(false);
  });
});
