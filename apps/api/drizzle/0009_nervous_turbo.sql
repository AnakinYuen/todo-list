-- Converts the dependency-picker search from the withdrawn pg_trgm substring
-- index to a plain btree prefix index. The DROPs converge databases that already
-- applied the earlier 0009 (trigram); both are no-ops on a fresh database.
DROP INDEX IF EXISTS "todos_name_trgm_idx";--> statement-breakpoint
DROP EXTENSION IF EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "todos_name_prefix_idx" ON "todos" USING btree (lower("name") text_pattern_ops);
