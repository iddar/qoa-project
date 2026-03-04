CREATE TYPE "public"."campaign_accumulation_mode" AS ENUM('count', 'amount');--> statement-breakpoint
CREATE TYPE "public"."campaign_accumulation_rule_scope_type" AS ENUM('campaign', 'brand', 'product');--> statement-breakpoint
CREATE TABLE "campaign_accumulation_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"scope_type" "campaign_accumulation_rule_scope_type" NOT NULL,
	"scope_id" uuid,
	"scope_brand_id" uuid,
	"scope_product_id" uuid,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"flat_bonus" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "accumulation_mode" "campaign_accumulation_mode" DEFAULT 'count' NOT NULL;--> statement-breakpoint
ALTER TABLE "rewards" ADD COLUMN "min_tier_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_accumulation_rules" ADD CONSTRAINT "campaign_accumulation_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_accumulation_rules" ADD CONSTRAINT "campaign_accumulation_rules_scope_brand_id_brands_id_fk" FOREIGN KEY ("scope_brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_accumulation_rules" ADD CONSTRAINT "campaign_accumulation_rules_scope_product_id_products_id_fk" FOREIGN KEY ("scope_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_accumulation_rules_campaign_idx" ON "campaign_accumulation_rules" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_accumulation_rules_scope_idx" ON "campaign_accumulation_rules" USING btree ("scope_type");--> statement-breakpoint
CREATE INDEX "campaign_accumulation_rules_active_idx" ON "campaign_accumulation_rules" USING btree ("active");--> statement-breakpoint
CREATE INDEX "campaign_accumulation_rules_created_at_idx" ON "campaign_accumulation_rules" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_min_tier_id_campaign_tiers_id_fk" FOREIGN KEY ("min_tier_id") REFERENCES "public"."campaign_tiers"("id") ON DELETE set null ON UPDATE no action;