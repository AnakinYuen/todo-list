CREATE TABLE "todo_dependencies" (
	"dependent_id" uuid NOT NULL,
	"dependency_id" uuid NOT NULL,
	CONSTRAINT "todo_dependencies_dependent_id_dependency_id_pk" PRIMARY KEY("dependent_id","dependency_id")
);
--> statement-breakpoint
ALTER TABLE "todo_dependencies" ADD CONSTRAINT "todo_dependencies_dependent_id_todos_id_fk" FOREIGN KEY ("dependent_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_dependencies" ADD CONSTRAINT "todo_dependencies_dependency_id_todos_id_fk" FOREIGN KEY ("dependency_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_dependencies_dependency_idx" ON "todo_dependencies" USING btree ("dependency_id");