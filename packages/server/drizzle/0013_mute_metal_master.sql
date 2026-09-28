ALTER TABLE "portal_endpoints" ADD COLUMN "footprint" jsonb;--> statement-breakpoint
ALTER TABLE "portal_endpoints" ADD COLUMN "flipped" boolean DEFAULT false NOT NULL;