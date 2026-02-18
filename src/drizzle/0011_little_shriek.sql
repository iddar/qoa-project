CREATE TYPE "public"."campaign_policy_period" AS ENUM('transaction', 'day', 'week', 'month', 'lifetime');--> statement-breakpoint
CREATE TYPE "public"."campaign_policy_scope_type" AS ENUM('campaign', 'brand', 'product');--> statement-breakpoint
CREATE TYPE "public"."campaign_policy_type" AS ENUM('max_accumulations', 'min_amount', 'min_quantity', 'cooldown');--> statement-breakpoint
CREATE TABLE "campaign_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"policy_type" "campaign_policy_type" NOT NULL,
	"scope_type" "campaign_policy_scope_type" NOT NULL,
	"scope_id" uuid,
	"scope_brand_id" uuid,
	"scope_product_id" uuid,
	"period" "campaign_policy_period" NOT NULL,
	"value" integer NOT NULL,
	"config" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaign_policies" ADD CONSTRAINT "campaign_policies_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_policies" ADD CONSTRAINT "campaign_policies_scope_brand_id_brands_id_fk" FOREIGN KEY ("scope_brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_policies" ADD CONSTRAINT "campaign_policies_scope_product_id_products_id_fk" FOREIGN KEY ("scope_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_policies_campaign_idx" ON "campaign_policies" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_policies_type_idx" ON "campaign_policies" USING btree ("policy_type");--> statement-breakpoint
CREATE INDEX "campaign_policies_scope_idx" ON "campaign_policies" USING btree ("scope_type");--> statement-breakpoint
CREATE INDEX "campaign_policies_active_idx" ON "campaign_policies" USING btree ("active");--> statement-breakpoint
CREATE INDEX "campaign_policies_created_at_idx" ON "campaign_policies" USING btree ("created_at");
