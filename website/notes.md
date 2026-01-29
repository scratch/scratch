---
Existing documentation Structure
---

# Documentation

## Quick Start

## Project Structure
  ### pages/
  ### src/
  ### public/
  ### .scratch/s
  ### package.json

## Writing Content
  ### Markdown Basics
  ### Code
  ### Frontmatter
      - simplify this
  ### Using Components
  ### Component Patterns
      - do we need this?
  ### Static Assets

## Styling
  ### Tailwind CSS
  ### Typography
  ### Exluding from Prose
  ### Custom Markdown Components
  ### PageWrapper

## Commands
  ### scratch create
  ### scratch dev
  ### scratch build
  ### scratch preview
  ### scratch watch
  ### scratch clean
  ### scratch eject
  ### scratch config
  ### scratch update
  ### Global Options
      - odd that this is is a peer of the commands?

## Authentication
  ### scratch login
  ### scratch logout
  ### scratch whoami

## Publishing Your Site
  ### scratch publish
  ### Project Naming
  ### URL structure
  ### Updating your site
  
## Project Management
  ### scratch projects ls
  ### scratch projects info
  ### scratch projects rm

## Visibility
  ### Visibility Modes
  ### Setting Visibility

## Share Tokens
  ### scratch share ls
  ### scratch share revoke

## Configuration
  ### Project Configuration
  ### Credentials

## Build Pipeline
  ### Build Steps
  ### Mdx Plugins
  ### Syntax Highlighting
  ### Cache Management

## Self-hosting
  ### When to self-hosting
  ### Infrastructure Requirements
  ### Setup
  ### Environment Variables
  ### Authentication Modes
  ### Domain Configuration

## Cloudflare Access
  ### scratch cf-access

## API Reference
  ### Authentication
  ### Endpoints
    #### User
    #### Projects
    #### Deploys
    #### Share Tokens
  ### Error Codes

## Troubleshooting
  ### Build Errors
  ### Login Issues
  ### Publish Failures
  ### Debugging



---
Proposed documentation structure
---

## Quick Start

## Concepts

## Scratch CLI
  ### Overview
  ### Creating and building your project
    #### scratch create
    #### scratch dev
    #### scratch build
      - should refer to the build pipeline section
    #### scratch preview
    #### scratch clean
    #### scratch eject
  ### Publishing your project
    #### scratch publish
      - should document naming your project
      - should refer the reader to the scratch login section for more info on selecting a scratch server
      - should document 
    #### scratch login
      - should document how the user can specify a scratch server url
      - should document where credentials are stored and how it works 
        to be logged in to more than one server at the same time
    #### scratch logout
    #### scratch config
    #### scratch whoami
    #### scratch projects
      - should document ls|info|rm
    #### scratch share
      - should document share|ls|revoke
    #### scratch cf-access

  ### Scratch build pipeline
    #### Build Steps
    #### Build Cache

  ### scratch watch
    - this is a handy feature for viewing markdown files locally


## Scratch Server
  ### Overview
    - server gives authors a way to share their work with others, either privately with friends and colleagues or publicly with the world.
    - currently runs on cloudflare and can optionally be protected by Cloudflare Access. (maybe this is actually called zero trust now?)
  ### scratch.dev
    - document that right now anyone can publish to scratch.dev for free, and that projects will only stay published for 30 days while scratch is in Preview.
    - document how routing works on scratch.dev. That is, when you publish a project what the URLs at which it will be available
    - security warning: scratch is in preview and should not be relied upon yet to serve anything sensitive or important. Refer users to the source code and remind them that they can host their own scratch server behind Cloudflare Access if they want additional security
  ### Self-hosting
    - Explain why self-hosting is useful. User can use the server for their own personal website, or as a shared space for colleagues to share writing privately with each other.
    #### Setting up Cloudflare
    #### Configuring your server
      ##### authentication modes
      ##### domain configuration
    #### Deploying your server
    #### publishing to `www` and the root domain
  ### Security
    - describe the approach we've taken to securing the server
    - warn the user that scratch is in preview and that users should not assume it is secure.
    - users who want to publish sensitive content should consider self hosting behind Cloudflare Access (or Zero Trust?) to do this
  ### API Reference
    #### Authentication
    #### Endpoints
      ##### User
      ##### Projects
      ##### Deploys
      ##### Share Tokens
    #### Error Codes
