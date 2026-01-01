-- Migration: 012_archive_old_memory.sql
-- Archives the old user_memory table after migration to knowledge system
-- The data has been migrated to knowledge_events as explicit source events

-- Rename table to archive
ALTER TABLE IF EXISTS user_memory RENAME TO user_memory_archive;

-- Add comment explaining the archive
COMMENT ON TABLE user_memory_archive IS
  'Archived: Migrated to knowledge_events on 2026-01-01.
   Kept for historical reference. Do not use for new queries.';

-- Drop the old search function (no longer needed)
DROP FUNCTION IF EXISTS search_memories(text, uuid, double precision, integer);
DROP FUNCTION IF EXISTS touch_memory(uuid);
DROP FUNCTION IF EXISTS supersede_memory(uuid, text, text, double precision);
