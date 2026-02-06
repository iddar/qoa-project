CREATE TYPE "public"."store_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(100),
	"address" text,
	"phone" varchar(20),
	"status" "store_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"store_id" uuid,
	"code" varchar(32) NOT NULL,
	"current_tier_id" uuid,
	"status" "card_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_code_key" ON "stores" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_code_key" ON "cards" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_user_campaign_key" ON "cards" USING btree ("user_id","campaign_id","store_id");--> statement-breakpoint
CREATE INDEX "cards_user_idx" ON "cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cards_campaign_idx" ON "cards" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "cards_store_idx" ON "cards" USING btree ("store_id");
