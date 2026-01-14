// Main entry point - re-exports all shared types

// Group (access control)
export {
  groupSchema,
  type Group,
  matchesGroup,
  parseGroup,
  validateGroupInput,
  groupContains,
} from './group'

// Project validation and URL utilities
export {
  validateProjectName,
  getEmailLocalPart,
  getEmailDomain,
  isSingleDomainAllowedUsers,
  buildProjectUrls,
  parsePagePath,
  type ValidationResult,
  type ProjectUrls,
  type BuildProjectUrlsOptions,
  type ParsedPagePath,
} from './project'

// API types
export * from './api'
