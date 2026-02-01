import { describe, test, expect } from 'bun:test'
import { UI_CSS } from '../src/lib/ui-styles'
import { LOGO_SVG } from '../src/lib/ui-logo'

describe('ui-styles.ts', () => {
  test('UI_CSS is a non-empty string', () => {
    expect(typeof UI_CSS).toBe('string')
    expect(UI_CSS.length).toBeGreaterThan(0)
  })

  test('UI_CSS contains expected CSS selectors', () => {
    // Basic reset
    expect(UI_CSS).toContain('box-sizing:border-box')
    // Body styling
    expect(UI_CSS).toContain('body{')
    // Page class
    expect(UI_CSS).toContain('.page{')
    // Button styles
    expect(UI_CSS).toContain('.btn{')
    expect(UI_CSS).toContain('.btn-primary{')
    expect(UI_CSS).toContain('.btn-danger{')
    // Alert styles
    expect(UI_CSS).toContain('.alert{')
    expect(UI_CSS).toContain('.alert-success{')
    expect(UI_CSS).toContain('.alert-error{')
    // Device authorization styles
    expect(UI_CSS).toContain('.device-approval{')
    expect(UI_CSS).toContain('.code-display{')
  })
})

describe('ui-logo.ts', () => {
  test('LOGO_SVG is a non-empty string', () => {
    expect(typeof LOGO_SVG).toBe('string')
    expect(LOGO_SVG.length).toBeGreaterThan(0)
  })

  test('LOGO_SVG is valid SVG', () => {
    // Starts with SVG tag
    expect(LOGO_SVG).toMatch(/^<svg\s/)
    // Ends with closing SVG tag
    expect(LOGO_SVG).toMatch(/<\/svg>$/)
    // Has xmlns attribute
    expect(LOGO_SVG).toContain('xmlns="http://www.w3.org/2000/svg"')
    // Has viewBox
    expect(LOGO_SVG).toContain('viewBox="0 0 1000 360"')
    // Has logo class
    expect(LOGO_SVG).toContain('class="logo"')
    // Contains the "Scratch" text
    expect(LOGO_SVG).toContain('Scratch</text>')
  })
})
