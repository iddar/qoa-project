CREATE TYPE "public"."tier_benefit_type" AS ENUM('discount', 'reward', 'multiplier', 'free_product');--> statement-breakpoint
CREATE TYPE "public"."tier_qualification_mode" AS ENUM('any', 'all');--> statement-breakpoint
CREATE TYPE "public"."tier_window_unit" AS ENUM('day', 'month', 'year');--> statement-breakpoint
CREATE TABLE "campaign_tiers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"order" integer NOT NULL,
	"threshold_value" integer NOT NULL,
	"window_unit" "tier_window_unit" DEFAULT 'day' NOT NULL,
	"window_value" integer DEFAULT 90 NOT NULL,
	"min_purchase_count" integer,
	"min_purchase_amount" integer,
	"qualification_mode" "tier_qualification_mode" DEFAULT 'any' NOT NULL,
	"grace_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tier_benefits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tier_id" uuid NOT NULL,
	"type" "tier_benefit_type" NOT NULL,
	"config" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "tier_grace_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "tier_last_evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_tiers" ADD CONSTRAINT "campaign_tiers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_benefits" ADD CONSTRAINT "tier_benefits_tier_id_campaign_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."campaign_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tiers_campaign_order_key" ON "campaign_tiers" USING btree ("campaign_id","order");--> statement-breakpoint
CREATE INDEX "campaign_tiers_campaign_idx" ON "campaign_tiers" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_tiers_threshold_idx" ON "campaign_tiers" USING btree ("threshold_value");--> statement-breakpoint
CREATE INDEX "tier_benefits_tier_idx" ON "tier_benefits" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "tier_benefits_type_idx" ON "tier_benefits" USING btree ("type");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_current_tier_id_campaign_tiers_id_fk" FOREIGN KEY ("current_tier_id") REFERENCES "public"."campaign_tiers"("id") ON DELETE set null ON UPDATE no action;