CREATE TYPE "public"."scrape_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "unit_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"faction_id" integer NOT NULL,
	"slug" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"wahapedia_url" text,
	"discovered_at" timestamp DEFAULT now(),
	"last_scraped_at" timestamp,
	"scrape_status" "scrape_status" DEFAULT 'pending'
);
--> statement-breakpoint
ALTER TABLE "unit_index" ADD CONSTRAINT "unit_index_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unit_index_faction_idx" ON "unit_index" USING btree ("faction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unit_index_slug_faction_idx" ON "unit_index" USING btree ("slug","faction_id");--> statement-breakpoint
CREATE INDEX "unit_index_status_idx" ON "unit_index" USING btree ("scrape_status");