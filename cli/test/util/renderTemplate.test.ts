import { describe, expect, test } from "bun:test";
import { renderTemplate } from "../../src/util";

describe("renderTemplate", () => {
  test("replaces variables in template", () => {
    const template = "Hello, {{name}}! Welcome to {{project}}.";
    const variables = {
      name: "User",
      project: "scratch"
    };
    
    const result = renderTemplate(template, variables);
    expect(result).toBe("Hello, User! Welcome to scratch.");
  });
  
  test("keeps variable placeholder when variable is not provided", () => {
    const template = "Hello, {{name}}! Welcome to {{project}}.";
    const variables = {
      name: "User"
    };
    
    const result = renderTemplate(template, variables);
    expect(result).toBe("Hello, User! Welcome to {{project}}.");
  });
  
  test("handles templates with no variables", () => {
    const template = "Hello, world!";
    const variables = {};
    
    const result = renderTemplate(template, variables);
    expect(result).toBe("Hello, world!");
  });
  
  test("handles multiple occurrences of the same variable", () => {
    const template = "{{greeting}}, {{name}}! {{greeting}} again, {{name}}!";
    const variables = {
      greeting: "Hello",
      name: "User"
    };
    
    const result = renderTemplate(template, variables);
    expect(result).toBe("Hello, User! Hello again, User!");
  });
});
