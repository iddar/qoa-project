CREATE TYPE "public"."redemption_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."reward_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"cost" integer NOT NULL,
	"status" "redemption_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"image_url" text,
	"cost" integer NOT NULL,
	"stock" integer,
	"status" "reward_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "redemptions_card_idx" ON "redemptions" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "redemptions_reward_idx" ON "redemptions" USING btree ("reward_id");--> statement-breakpoint
CREATE INDEX "redemptions_status_idx" ON "redemptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "redemptions_created_at_idx" ON "redemptions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rewards_campaign_idx" ON "rewards" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "rewards_status_idx" ON "rewards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rewards_created_at_idx" ON "rewards" USING btree ("created_at");