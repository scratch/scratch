-- Phase 3 Migration: Remove workspace concept
-- Run this BEFORE the schema.sql on existing databases

-- Drop workspace tables (CASCADE will remove dependent data)
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;

-- Drop related indexes (if they exist independently)
DROP INDEX IF EXISTS idx_workspaces_name;
DROP INDEX IF EXISTS idx_workspace_members_user;
