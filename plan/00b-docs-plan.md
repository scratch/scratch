# Documentation Update Plan

## Goal
Update `website/pages/docs.mdx` to comprehensively document:
- Scratch CLI (all commands)
- Scratch Server features
- Public server at app.scratch.dev

## Decisions Made
- **Audience**: Full coverage (end users + developers + self-hosters)
- **Structure**: Single page with sidebar navigation
- **Advanced**: Include build pipeline, self-hosting, and API reference

## Current State
- `website/pages/docs.mdx` - 510 lines covering local CLI only
- `website/pages/components/DocsSidebar.tsx` - Auto-generates TOC from h2 headings

---

## Final Section Structure

### Part 1: Getting Started
1. **Quick Start** - Install → create → dev → publish workflow

### Part 2: Creating Content
2. **Project Structure** - pages/, src/, public/, .scratch/, package.json
3. **Writing Content**
   - Markdown basics (CommonMark + GFM)
   - Frontmatter (title, description, OG tags, full reference)
   - Using React components (auto-import, locations, patterns)
   - Static assets (images, media)
4. **Styling**
   - Tailwind CSS configuration
   - Typography plugin and prose classes
   - Custom components (PageWrapper, CodeBlock, Heading, Link)

### Part 3: CLI Commands
5. **Commands**
   - `scratch create` - Create new project
   - `scratch dev` - Development server with hot reload
   - `scratch build` - Production build
   - `scratch preview` - Preview built site
   - `scratch watch` - Quick file viewing
   - `scratch clean` - Remove build artifacts
   - `scratch eject` - Extract template files
   - `scratch config` - Configure project settings
   - `scratch update` - Self-update CLI
   - Global options (-v, -q, --help, --version)

### Part 4: Publishing to app.scratch.dev
6. **Authentication**
   - Creating an account (Google OAuth)
   - `scratch login` - Device authorization flow
   - `scratch logout` - Clear credentials
   - `scratch whoami` - Check login status
7. **Publishing Your Site**
   - `scratch publish` - Build and deploy
   - Project naming rules
   - URL structure (username/project-name)
   - Updating and versioning
8. **Project Management**
   - `scratch projects list` - List your projects
   - `scratch projects info` - Project details
   - `scratch projects delete` - Delete a project

### Part 5: Access Control
9. **Visibility Modes**
   - `public` - Open to everyone
   - `private` - Only you
   - `@domain.com` - Domain restriction
   - `email@example.com` - Specific people
   - Setting visibility at publish or via config
10. **Share Tokens**
    - Purpose and use cases
    - `scratch share create` - Create time-limited link
    - `scratch share list` - List active tokens
    - `scratch share revoke` - Revoke a token
    - Duration options (1d, 1w, 1m)

### Part 6: Configuration
11. **Configuration Files**
    - `.scratch/project.toml` - Project settings
    - `~/.scratch/credentials.json` - Authentication
    - Interactive setup flow

### Part 7: Advanced
12. **Build Pipeline**
    - 11-step build process overview
    - Build options (--base, --strict, --static, --highlight)
    - Cache management (.scratch/cache/)
13. **Self-Hosting**
    - When to self-host vs app.scratch.dev
    - Infrastructure requirements (Cloudflare Workers, D1, R2)
    - Setup with `bun ops server -i <instance> setup`
    - Environment variables overview
    - Authentication modes (BetterAuth vs Cloudflare Access)
    - Domain configuration (app + content subdomains)
    - Deployment and migrations
14. **Cloudflare Access Integration**
    - `scratch cf-access` - Configure service tokens
    - When to use (Zero Trust deployments)
15. **API Reference**
    - Authentication (Bearer tokens)
    - Project endpoints (CRUD)
    - Deploy endpoint
    - Share token endpoints
    - Error codes reference

### Part 8: Help
16. **Troubleshooting**
    - Common build errors
    - Login/auth issues
    - Publish failures
    - Verbose mode debugging

---

## Files to Modify
- `website/pages/docs.mdx` - Rewrite with new structure
- `website/pages/components/DocsSidebar.tsx` - May need updates for nested sections

## Implementation Approach
1. Keep existing content where applicable (project structure, styling, local commands)
2. Add new sections for publishing, visibility, share tokens
3. Add advanced sections at the end
4. Update DocsSidebar if needed for better navigation
5. Add code examples and command output for each CLI command

## Verification
- Run `scratch dev` in website/ to preview changes
- Verify sidebar navigation works correctly
- Test all code examples are accurate
- Ensure responsive layout works on mobile
