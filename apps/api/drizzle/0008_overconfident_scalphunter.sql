CREATE INDEX "todos_status_idx" ON "todos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "todos_priority_idx" ON "todos" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "todos_due_date_idx" ON "todos" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "todos_series_id_idx" ON "todos" USING btree ("series_id");