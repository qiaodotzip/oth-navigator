CREATE TABLE IF NOT EXISTS "captures" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"duration_ms" integer,
	"level_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyframes" (
	"id" text PRIMARY KEY NOT NULL,
	"capture_id" text NOT NULL,
	"time_ms" integer,
	"image_id" text NOT NULL,
	"storage_path" text NOT NULL,
	"checksum" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "places" (
	"id" text PRIMARY KEY NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"level_id" text,
	"room_id" text,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sightings" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"keyframe_id" text NOT NULL,
	"box" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "keyframes_capture_idx" ON "keyframes" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sightings_place_idx" ON "sightings" USING btree ("place_id");