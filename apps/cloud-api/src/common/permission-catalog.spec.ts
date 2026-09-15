import { describe, expect, it } from "vitest";

import { PERMISSION_CATALOG, PERMISSION_LABELS, SYSTEM_ROLE_PERMISSIONS } from "./permission-catalog.js";

describe("permission catalog", () => {
  it("has a label for every permission key, and no orphaned labels", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG);
    const labelKeys = new Set(Object.keys(PERMISSION_LABELS));
    expect(labelKeys).toEqual(catalogKeys);
  });

  it("only grants keys that exist in the catalog to seeded system roles", () => {
    const catalogKeys = new Set(PERMISSION_CATALOG);
    for (const [role, keys] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      for (const key of keys) {
        expect(catalogKeys.has(key), `${role} has unknown permission key: ${key}`).toBe(true);
      }
    }
  });
});
