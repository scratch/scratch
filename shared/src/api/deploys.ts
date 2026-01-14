import { z } from 'zod'

// Deploy request query parameters
// POST /api/projects/:name/deploy
//
// URL path: name (project name)
// Query params: visibility
// Body: zip file (application/zip)

export const deployCreateQuerySchema = z.object({
  // Project visibility (defaults to 'public' for new projects)
  // Updates existing project visibility when provided
  visibility: z.union([
    z.literal('public'),
    z.literal('private'),
    z.string(), // email, @domain, or comma-separated list
  ]).optional(),
})

export type DeployCreateQuery = z.infer<typeof deployCreateQuerySchema>

// Full deploy request parameters (for CLI use)
export interface DeployCreateParams {
  // Project name (URL path parameter)
  name: string
  // Project visibility (query parameter)
  // Updates existing project visibility, or sets initial visibility for new projects
  // Accepts: 'public', 'private', '@domain.com', 'email@example.com', or comma-separated list
  visibility?: string
}
