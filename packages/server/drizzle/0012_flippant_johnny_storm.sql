CREATE TABLE IF NOT EXISTS "plan_pdfs" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "room_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"name_en" text NOT NULL,
	"kind" text NOT NULL,
	"footprint" jsonb,
	"holes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label_point" jsonb NOT NULL,
	"area_m2" double precision NOT NULL,
	"source" jsonb NOT NULL,
	"accepted_room_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "level_images" ADD COLUMN "source" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "room_drafts_level_idx" ON "room_drafts" USING btree ("level_id");