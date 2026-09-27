ALTER TABLE "places" ADD COLUMN "pathway_kind_id" text;--> statement-breakpoint
ALTER TABLE "keyframes" DROP COLUMN IF EXISTS "pathway_kind_id";