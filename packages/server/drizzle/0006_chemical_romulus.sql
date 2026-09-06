ALTER TABLE "places" ADD COLUMN "status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "proposed_by" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "status" text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "proposed_by" text DEFAULT '' NOT NULL;