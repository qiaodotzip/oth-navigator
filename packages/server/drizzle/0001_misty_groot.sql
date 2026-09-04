CREATE TABLE IF NOT EXISTS "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"triangle_count" integer NOT NULL,
	"bbox" jsonb NOT NULL,
	"uploaded_by" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buildings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"anchor_lat" double precision NOT NULL,
	"anchor_lng" double precision NOT NULL,
	"rotation_deg" double precision DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "doorways" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"room_a" text NOT NULL,
	"room_b" text NOT NULL,
	"segment" jsonb NOT NULL,
	"width_m" double precision NOT NULL,
	"step_free" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_locks" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"locked_by" text NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entrances" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"room_id" text NOT NULL,
	"point" jsonb NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_zh" text DEFAULT '' NOT NULL,
	"step_free" boolean DEFAULT true NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"hours" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "levels" (
	"id" text PRIMARY KEY NOT NULL,
	"building_id" text NOT NULL,
	"code" text NOT NULL,
	"ordinal" integer NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"elevation_m" double precision NOT NULL,
	"height_m" double precision NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nav_hints" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"polyline" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placements" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"room_id" text,
	"position" jsonb NOT NULL,
	"rotation_deg" double precision DEFAULT 0 NOT NULL,
	"scale" double precision DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"portal_id" text NOT NULL,
	"level_id" text NOT NULL,
	"room_id" text NOT NULL,
	"point" jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"step_free" boolean,
	"name_en" text DEFAULT '' NOT NULL,
	"name_zh" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "published_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"notes" text DEFAULT '' NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"manifest" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"kind" text NOT NULL,
	"footprint" jsonb NOT NULL,
	"holes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"height_m" double precision NOT NULL,
	"walkable" boolean DEFAULT false NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_zh" text DEFAULT '' NOT NULL,
	"verification" jsonb DEFAULT '{"status":"unverified","evidence":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"level_id" text NOT NULL,
	"room_id" text NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"category" text NOT NULL,
	"unit_no" text,
	"counters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accessibility" jsonb DEFAULT '{"liftAccess":true,"stepFreeRoute":true}'::jsonb NOT NULL,
	"hours" text,
	"source_url" text NOT NULL,
	"valid_from" text,
	"valid_to" text,
	"verification" jsonb DEFAULT '{"status":"unverified","evidence":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doorways_level_idx" ON "doorways" USING btree ("level_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_locks_pk" ON "entity_locks" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rooms_level_idx" ON "rooms" USING btree ("level_id");