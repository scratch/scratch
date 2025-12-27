import { describe, expect, test } from "bun:test";
import { getStepNumber } from "../../src/build/orchestrator";

describe("getStepNumber", () => {
    test("extracts simple numeric step number", () => {
        expect(getStepNumber("01-ensure-dependencies")).toBe("01");
        expect(getStepNumber("02-reset-directories")).toBe("02");
        expect(getStepNumber("03-create-tsx-entries")).toBe("03");
    });

    test("extracts step number with letter suffix", () => {
        expect(getStepNumber("05b-render-server")).toBe("05b");
    });

    test("handles double-digit step numbers", () => {
        expect(getStepNumber("10-copy-to-dist")).toBe("10");
        expect(getStepNumber("99-final-step")).toBe("99");
    });

    test("returns full name when no step number pattern", () => {
        expect(getStepNumber("custom-step")).toBe("custom-step");
        expect(getStepNumber("noprefix")).toBe("noprefix");
    });

    test("handles edge cases", () => {
        expect(getStepNumber("1-single-digit")).toBe("1");
        expect(getStepNumber("123-triple-digit")).toBe("123");
        expect(getStepNumber("00-zero-padded")).toBe("00");
    });

    test("only matches single letter suffix after number", () => {
        // The pattern is ^(\d+[a-z]?)- which requires a hyphen after the optional letter
        // "05ab-test" doesn't match because "b" is not followed by "-"
        // So it falls through to return the full name
        expect(getStepNumber("05ab-test")).toBe("05ab-test");
        // But "05a-test" works because the optional letter is followed by "-"
        expect(getStepNumber("05a-test")).toBe("05a");
    });
});
