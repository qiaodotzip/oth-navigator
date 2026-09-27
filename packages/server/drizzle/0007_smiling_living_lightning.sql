CREATE TABLE IF NOT EXISTS "pathway_kinds" (
	"id" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text DEFAULT '' NOT NULL,
	"color_hex" text NOT NULL,
	"modelling_note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pathways" ADD COLUMN "kind_id" text;