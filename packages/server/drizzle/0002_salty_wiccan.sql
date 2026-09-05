CREATE TABLE IF NOT EXISTS "level_images" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"checksum" text NOT NULL,
	"width_px" integer NOT NULL,
	"height_px" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"metres_per_pixel" double precision,
	"offset_x" double precision DEFAULT 0 NOT NULL,
	"offset_y" double precision DEFAULT 0 NOT NULL,
	"opacity" double precision DEFAULT 0.6 NOT NULL,
	"uploaded_by" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "level_images_level_idx" ON "level_images" USING btree ("level_id");