CREATE TABLE IF NOT EXISTS "pathways" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"polyline" jsonb NOT NULL,
	"width_m" double precision DEFAULT 2.4 NOT NULL,
	"step_free" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pathways_level_idx" ON "pathways" USING btree ("level_id");