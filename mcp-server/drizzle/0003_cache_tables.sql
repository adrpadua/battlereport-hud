CREATE TABLE "ai_response_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" varchar(20) NOT NULL,
	"factions" jsonb NOT NULL,
	"raw_response" text NOT NULL,
	"prompt_hash" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" varchar(20) NOT NULL,
	"factions" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "extraction_cache_video_id_unique" UNIQUE("video_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_response_cache_video_faction_idx" ON "ai_response_cache" USING btree ("video_id","factions");--> statement-breakpoint
CREATE INDEX "ai_response_cache_expires_at_idx" ON "ai_response_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_cache_video_id_idx" ON "extraction_cache" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "extraction_cache_expires_at_idx" ON "extraction_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stratagems_slug_faction_unique" ON "stratagems" USING btree ("slug","faction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "faqs_slug_idx" ON "faqs" USING btree ("slug");
