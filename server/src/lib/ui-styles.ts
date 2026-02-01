/**
 * UI Styles - Minified CSS for server-rendered pages
 *
 * This CSS is inlined in the HTML for single HTTP request rendering.
 * Minified for performance - original source is documented below.
 *
 * Styles include:
 * - Base reset and typography
 * - Page layout and centering
 * - Logo sizing
 * - Text utilities (muted, small)
 * - Button styles (primary, danger)
 * - User card display
 * - Alert boxes (success, error)
 * - Device authorization UI
 * - Code display styling
 */
export const UI_CSS = `*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.5;color:#111827;background:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}.page{text-align:center;padding:2rem;max-width:28rem;width:100%}.page h1{font-size:1.875rem;font-weight:700;margin:0 0 1.5rem}.logo{width:12rem;margin-bottom:1.5rem}.text-muted{color:#4b5563;margin:0 0 1rem}.text-sm{font-size:.875rem}.tagline{margin-bottom:1.5rem}.label{font-size:.875rem;color:#6b7280;margin:0 0 .5rem}.btn{display:inline-block;padding:.75rem 1.5rem;border-radius:.5rem;font-weight:500;font-size:1rem;text-decoration:none;border:none;cursor:pointer;transition:background-color .2s}.btn-primary{background:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}.btn-danger{background:#dc2626;color:#fff}.btn-danger:hover{background:#b91c1c}.text-link{color:#4b5563;text-decoration:underline}.text-link:hover{color:#111827}.user-card{background:#f9fafb;padding:1rem;border-radius:.5rem;margin-bottom:1.5rem}.user-email{font-weight:500;color:#111827;margin:0}.user-name{color:#4b5563;margin:.25rem 0 0}.alert{padding:1rem;border-radius:.5rem;border:1px solid;margin-bottom:1.5rem}.alert p{margin:0}.alert-success{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}.alert-error{background:#fef2f2;border-color:#fecaca;color:#b91c1c}.device-approval{max-width:24rem;margin:0 auto;text-align:left}.code-display{background:#f3f4f6;padding:1rem;border-radius:.5rem;text-align:center;margin-bottom:.5rem}.code-display code{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:1.5rem;font-weight:700;letter-spacing:.1em}.button-row{display:flex;gap:.75rem;margin-top:1.5rem}.button-row .btn{flex:1}`
