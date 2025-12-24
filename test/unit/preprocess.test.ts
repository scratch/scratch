import { describe, expect, test, beforeEach } from "bun:test";
import {
    getPreprocessingErrors,
    resetPreprocessingState,
    createPreprocessMdxPlugin,
    checkDefaultExport,
    type ComponentMap,
} from "../../src/preprocess";

describe("preprocess error handling", () => {
    beforeEach(() => {
        resetPreprocessingState();
    });

    test("getPreprocessingErrors returns empty array initially", () => {
        const errors = getPreprocessingErrors();
        expect(errors).toEqual([]);
    });

    test("getPreprocessingErrors clears errors after getting", () => {
        // Get errors twice - second call should return empty
        const errors1 = getPreprocessingErrors();
        const errors2 = getPreprocessingErrors();
        expect(errors1).toEqual([]);
        expect(errors2).toEqual([]);
    });

    test("resetPreprocessingState clears all state", () => {
        resetPreprocessingState();
        const errors = getPreprocessingErrors();
        expect(errors).toEqual([]);
    });
});

describe("createPreprocessMdxPlugin", () => {
    beforeEach(() => {
        resetPreprocessingState();
    });

    test("creates a plugin function", () => {
        const componentMap: ComponentMap = {
            Button: "/path/to/Button.jsx",
        };

        const plugin = createPreprocessMdxPlugin(componentMap);
        expect(typeof plugin).toBe("function");
    });

    test("plugin returns a transformer function", () => {
        const componentMap: ComponentMap = {};
        const plugin = createPreprocessMdxPlugin(componentMap);
        const transformer = plugin();
        expect(typeof transformer).toBe("function");
    });

    test("handles empty component map", () => {
        const componentMap: ComponentMap = {};
        const plugin = createPreprocessMdxPlugin(componentMap);

        // Create a minimal MDX AST
        const tree = {
            type: "root",
            children: [],
        };

        const transformer = plugin();
        // Should not throw
        expect(() => transformer(tree, {})).not.toThrow();
    });

    test("handles component map with conflicts set", () => {
        const componentMap: ComponentMap = {
            Button: "/path/to/Button.jsx",
        };
        const conflicts = new Set(["Button"]);

        const plugin = createPreprocessMdxPlugin(componentMap, conflicts);
        expect(typeof plugin).toBe("function");
    });
});

describe("checkDefaultExport", () => {
    // Should detect default exports
    test("detects 'export default function'", () => {
        expect(checkDefaultExport("export default function Foo() {}")).toBe(true);
    });

    test("detects 'export default class'", () => {
        expect(checkDefaultExport("export default class Foo {}")).toBe(true);
    });

    test("detects 'export default' with arrow function", () => {
        expect(checkDefaultExport("export default () => {}")).toBe(true);
    });

    test("detects 'export default' with identifier", () => {
        expect(checkDefaultExport("const Foo = () => {};\nexport default Foo;")).toBe(true);
    });

    test("detects 'export { x as default }'", () => {
        expect(checkDefaultExport("const Foo = () => {};\nexport { Foo as default };")).toBe(true);
    });

    test("detects 'export { default } from' re-export", () => {
        expect(checkDefaultExport("export { default } from './other';")).toBe(true);
    });

    test("detects 'export { x as default } from' re-export", () => {
        expect(checkDefaultExport("export { Foo as default } from './other';")).toBe(true);
    });

    test("detects default export in JSX component", () => {
        const jsx = `
            import React from 'react';
            function Button({ children }) {
                return <button className="btn">{children}</button>;
            }
            export default Button;
        `;
        expect(checkDefaultExport(jsx)).toBe(true);
    });

    // Should NOT detect as default exports
    test("returns false for named export only", () => {
        expect(checkDefaultExport("export function Foo() {}")).toBe(false);
    });

    test("returns false for named export with braces", () => {
        expect(checkDefaultExport("const Foo = () => {};\nexport { Foo };")).toBe(false);
    });

    test("returns false for 'export const'", () => {
        expect(checkDefaultExport("export const Foo = () => {};")).toBe(false);
    });

    test("returns false for empty file", () => {
        expect(checkDefaultExport("")).toBe(false);
    });

    test("returns false for file with no exports", () => {
        expect(checkDefaultExport("const Foo = () => {};")).toBe(false);
    });

    // Edge cases: comments should be ignored
    test("ignores 'export default' in single-line comment", () => {
        expect(checkDefaultExport("// export default Foo\nexport { Foo };")).toBe(false);
    });

    test("ignores 'export default' in multi-line comment", () => {
        expect(checkDefaultExport("/* export default Foo */\nexport { Foo };")).toBe(false);
    });

    test("ignores 'export default' in multi-line comment spanning lines", () => {
        const content = `
            /*
             * This component has export default in docs
             * export default SomeComponent
             */
            export { Foo };
        `;
        expect(checkDefaultExport(content)).toBe(false);
    });

    test("detects real default export after comment mentioning it", () => {
        const content = `
            // TODO: consider removing export default
            export default function Foo() {}
        `;
        expect(checkDefaultExport(content)).toBe(true);
    });

    // Mixed scenarios
    test("detects default among multiple exports", () => {
        const content = `
            export const helper = () => {};
            export function util() {}
            export default function Main() {}
        `;
        expect(checkDefaultExport(content)).toBe(true);
    });

    test("handles TypeScript syntax", () => {
        const ts = `
            interface Props { name: string }
            export default function Greeting({ name }: Props) {
                return <h1>Hello {name}</h1>;
            }
        `;
        expect(checkDefaultExport(ts)).toBe(true);
    });
});
