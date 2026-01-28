CREATE TABLE "terrain_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"season" varchar(50) NOT NULL,
	"image_base64" text NOT NULL,
	"battlefield_width" integer DEFAULT 60 NOT NULL,
	"battlefield_height" integer DEFAULT 44 NOT NULL,
	"source_url" text,
	"data_source" "data_source" DEFAULT 'wahapedia' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "terrain_layouts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "terrain_layouts_season_idx" ON "terrain_layouts" USING btree ("season");--> statement-breakpoint
CREATE UNIQUE INDEX "terrain_layouts_slug_idx" ON "terrain_layouts" USING btree ("slug");
