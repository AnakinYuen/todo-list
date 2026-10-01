-- ADR 0005: a Deleted TODO is no longer a Dependency of or on anything.
-- Clear any edges left over from before deletion removed them.
DELETE FROM "todo_dependencies"
WHERE "dependent_id" IN (SELECT "id" FROM "todos" WHERE "deleted_at" IS NOT NULL)
   OR "dependency_id" IN (SELECT "id" FROM "todos" WHERE "deleted_at" IS NOT NULL);
