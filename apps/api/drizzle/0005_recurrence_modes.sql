-- ADR 0007: recurrence rules gained an explicit mode. Existing rules carry the
-- calendar fields, so they become FIXED_SCHEDULE. Guarded so a re-run is a no-op.
UPDATE "todos"
SET "recurrence" = jsonb_build_object(
  'mode', 'FIXED_SCHEDULE',
  'schedule', "recurrence"
)
WHERE "recurrence" IS NOT NULL
  AND NOT ("recurrence" ? 'mode');
