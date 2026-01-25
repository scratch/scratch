# Dev Server Error Handling Plan

## Problem

When `scratch dev` encounters a compilation error, the server dies and requires a manual restart. This is disruptive to the development workflow.

## Current Behavior

**Initial build failure (line 245 in dev.ts):**
```typescript
await buildCommand(ctx, { ssg: false, static: options.static });
```
- If this fails, the error propagates up and `process.exit(1)` is called
- Server never starts

**Rebuild errors (lines 285-294):**
- These ARE caught and logged - server stays alive
- But errors only appear in terminal, not in browser
- Browser doesn't know about the error

## Solution: Vite-Style Error Handling

### 1. Graceful Initial Build Failure

Wrap initial build in try-catch and start server regardless:

```typescript
let currentBuildError: BuildError | null = null;
try {
  await buildCommand(ctx, { ssg: false, static: options.static });
} catch (error) {
  currentBuildError = formatBuildErrorForOverlay(error);
  log.error('Initial build failed:', currentBuildError.message);
  log.info('Starting dev server anyway - fix errors and save to rebuild');
}

// Start server regardless
const { server, port } = await startDevServerWithFallback(...);
```

### 2. Browser Error Overlay

Create Shadow DOM-based error overlay that displays:
- Error title
- File path with line/column
- Error message
- Code frame (snippet around error)
- Tip to fix and save

The overlay:
- Renders on top of page content
- Can be dismissed by fixing the error
- Uses Shadow DOM to avoid style conflicts

### 3. Enhanced WebSocket Protocol

Change from simple `'reload'` string to structured JSON messages:

| Message | Description |
|---------|-------------|
| `{ type: 'reload' }` | Full reload (backwards compatible) |
| `{ type: 'error', error: BuildError }` | Build failed, show overlay |
| `{ type: 'ok' }` | Build succeeded, clear overlay and reload |

### 4. Error Page for Initial Failures

When build fails before any HTML exists, serve a standalone error page with the overlay pre-rendered.

---

## Files to Modify

### `cli/src/cmd/dev.ts`
- Wrap initial build in try-catch (line 245)
- Track `currentBuildError` state
- Update fetch handler to serve error page when build failed
- Update `debouncedRebuild` to send structured messages
- Replace `injectLiveReloadScript` with enhanced version including overlay

### `cli/src/build/errors.ts`
- Add `BuildError` interface with file/line/column/frame
- Add `formatBuildErrorForOverlay()` function
- Add `generateCodeFrame()` helper

---

## Implementation Details

### BuildError Interface

```typescript
interface BuildError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;  // Code snippet around error
}
```

### Error Overlay Script (injected into HTML)

```javascript
class ScratchErrorOverlay extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    // Styles and markup for error display
  }
  show(error) { /* Display error */ }
  hide() { /* Hide overlay */ }
}
customElements.define('scratch-error-overlay', ScratchErrorOverlay);

const ws = new WebSocket('ws://localhost:${port}/__live_reload');
ws.onmessage = (event) => {
  // Handle legacy string 'reload' for backwards compat
  if (event.data === 'reload') { location.reload(); return; }

  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'reload': location.reload(); break;
    case 'error': overlay.show(data.error); break;
    case 'ok': overlay.hide(); location.reload(); break;
  }
};
```

### Rebuild Handler Update

```typescript
try {
  await buildCommand(ctx, { ssg: false, static: options.static });
  currentBuildError = null;
  broadcastMessage({ type: 'ok' });
} catch (error) {
  currentBuildError = formatBuildErrorForOverlay(error);
  broadcastMessage({ type: 'error', error: currentBuildError });
}
```

### Fetch Handler Update

```typescript
// If build failed, serve error page for HTML requests
if (currentBuildError && !hasStaticFileExtension(pathname)) {
  return new Response(generateErrorPage(currentBuildError, port), {
    headers: { 'Content-Type': 'text/html' },
  });
}
```

---

## Verification

1. **Initial build failure:**
   - Introduce syntax error in pages/index.mdx
   - Run `scratch dev`
   - Verify server starts and browser shows error overlay
   - Fix error, save, verify overlay clears and page loads

2. **Rebuild failure:**
   - Start `scratch dev` with working project
   - Introduce syntax error
   - Verify error overlay appears in browser
   - Fix error, verify page reloads correctly

3. **Backwards compatibility:**
   - Existing projects should work without changes
   - Old browsers that don't support custom elements gracefully degrade (just reload)
