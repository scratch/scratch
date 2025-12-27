import { describe, expect, test } from "bun:test";
import { formatBuildError } from "../../src/build/errors";

describe("formatBuildError", () => {
    describe("style attribute errors", () => {
        test("formats style prop error with helpful message", () => {
            const error = new Error(
                'The `style` prop expects a mapping from style properties to values, not a string'
            );
            const result = formatBuildError(error);

            expect(result).toContain("MDX syntax error");
            expect(result).toContain('Instead of:  <div style="color: red">');
            expect(result).toContain("Use:         <div style={{color: 'red'}}>");
            expect(result).toContain("MDX uses JSX syntax");
        });

        test("includes file path when available in stack trace", () => {
            const error = new Error(
                'The `style` prop expects a mapping from style properties to values, not a string'
            );
            error.stack = `Error: The \`style\` prop expects a mapping from style properties to values, not a string
    at renderToString (node_modules/react-dom/cjs/react-dom-server.browser.production.min.js:1:1)
    at Object.render (/project/.scratch-build-cache/server-compiled/about/index.js:123:45)`;

            const result = formatBuildError(error);
            expect(result).toContain("pages/about.mdx");
        });
    });

    describe("class vs className errors", () => {
        test("formats class attribute error with helpful message", () => {
            const error = new Error(
                'Invalid DOM property `class`. Did you mean `className`?'
            );
            const result = formatBuildError(error);

            expect(result).toContain("MDX syntax error");
            expect(result).toContain('Instead of:  <div class="foo">');
            expect(result).toContain('Use:         <div className="foo">');
            expect(result).toContain("use className instead of class");
        });
    });

    describe("invalid element type errors", () => {
        test("formats undefined element error with helpful message", () => {
            const error = new Error(
                'Element type is invalid: expected a string but got: undefined'
            );
            const result = formatBuildError(error);

            expect(result).toContain("MDX syntax error");
            expect(result).toContain("Unclosed HTML tag");
            expect(result).toContain('Instead of:  <img src="...">');
            expect(result).toContain('Use:         <img src="..." />');
            expect(result).toContain("Missing component");
        });

        test("formats object element error", () => {
            const error = new Error(
                'Element type is invalid: expected a string but got: object'
            );
            const result = formatBuildError(error);

            expect(result).toContain("MDX syntax error");
        });
    });

    describe("unclosed tag errors", () => {
        test("formats unclosed tag error with specific tag name", () => {
            const error = new Error(
                'Expected corresponding JSX closing tag for <div>'
            );
            const result = formatBuildError(error);

            expect(result).toContain("MDX syntax error");
            expect(result).toContain("Unclosed <div> tag");
            expect(result).toContain("Either close it: <div>...</div>");
            expect(result).toContain("Or self-close:   <div />");
        });

        test("formats unclosed img tag error", () => {
            const error = new Error(
                'Expected corresponding JSX closing tag for <img>'
            );
            const result = formatBuildError(error);

            expect(result).toContain("Unclosed <img> tag");
            expect(result).toContain("<img>...</img>");
            expect(result).toContain("<img />");
        });
    });

    describe("unexpected token errors", () => {
        test("formats unexpected token error with helpful message", () => {
            const error = new Error('Unexpected token');
            const result = formatBuildError(error);

            expect(result).toContain("MDX syntax error");
            expect(result).toContain("Invalid JSX syntax");
            expect(result).toContain("Unclosed tags");
            expect(result).toContain("use className not class");
            expect(result).toContain("use style={{}} not style=\"\"");
        });
    });

    describe("unrecognized errors", () => {
        test("returns original error message for unrecognized errors", () => {
            const error = new Error("Some other error that is not recognized");
            const result = formatBuildError(error);

            expect(result).toBe("Some other error that is not recognized");
        });

        test("handles string errors", () => {
            const result = formatBuildError("Plain string error");
            expect(result).toBe("Plain string error");
        });
    });

    describe("file path extraction", () => {
        test("extracts file path from server-compiled directory", () => {
            const error = new Error(
                'The `style` prop expects a mapping from style properties to values, not a string'
            );
            // The regex expects a single path segment (entry name) followed by /index.js
            error.stack = `Error: message
    at render (/project/.scratch-build-cache/server-compiled/about/index.js:1:1)`;

            const result = formatBuildError(error);
            expect(result).toContain("pages/about.mdx");
        });

        test("extracts file path from client-compiled directory", () => {
            const error = new Error(
                'Invalid DOM property `class`. Did you mean `className`?'
            );
            error.stack = `Error: message
    at render (/project/.scratch-build-cache/client-compiled/contact/index.js:1:1)`;

            const result = formatBuildError(error);
            expect(result).toContain("pages/contact.mdx");
        });

        test("handles errors without stack trace", () => {
            const error = new Error(
                'The `style` prop expects a mapping from style properties to values, not a string'
            );
            error.stack = undefined;

            const result = formatBuildError(error);
            expect(result).toContain("MDX syntax error");
            expect(result).not.toContain("pages/");
        });
    });
});
