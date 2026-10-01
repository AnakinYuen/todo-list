CREATE TYPE "public"."todo_priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"due_date" date,
	"status" "todo_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"priority" "todo_priority" DEFAULT 'MEDIUM' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
