import { describe, expect, test } from "bun:test";
import { formatNamespace } from "../../../src/cmd/cloud/namespace";

describe("formatNamespace", () => {
    test("returns 'global' for null", () => {
        expect(formatNamespace(null)).toBe("global");
    });

    test("returns 'global' for undefined", () => {
        expect(formatNamespace(undefined)).toBe("global");
    });

    test("returns 'global' for 'global' string", () => {
        expect(formatNamespace("global")).toBe("global");
    });

    test("returns custom namespace as-is", () => {
        expect(formatNamespace("example.com")).toBe("example.com");
    });

    test("returns another custom namespace as-is", () => {
        expect(formatNamespace("acme.org")).toBe("acme.org");
    });
});
