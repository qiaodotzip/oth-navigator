CREATE TABLE IF NOT EXISTS "floor_setup" (
	"level_id" text NOT NULL,
	"step" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"finished_by" text,
	"finished_via" text,
	"finished_at" timestamp with time zone,
	CONSTRAINT "floor_setup_level_id_step_pk" PRIMARY KEY("level_id","step")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "object_kinds" (
	"id" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text DEFAULT '' NOT NULL,
	"size" jsonb NOT NULL,
	"asset_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "placements" ALTER COLUMN "asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "object_kind_id" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sighting_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "object_kind_id" text;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_asset_or_kind" CHECK (asset_id is not null or object_kind_id is not null);