-- Migration: Add 'insight' and 'concept' memory types
-- These extend the memory system with richer extraction capabilities:
--   - insight: Wisdom, reasoning, "why" behind decisions
--   - concept: Mental models, frameworks, patterns worth remembering

ALTER TYPE memory_type ADD VALUE 'insight';
ALTER TYPE memory_type ADD VALUE 'concept';
