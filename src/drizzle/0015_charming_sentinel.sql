CREATE TYPE "public"."campaign_enrollment_mode" AS ENUM('open', 'opt_in', 'system_universal');--> statement-breakpoint
CREATE TYPE "public"."campaign_subscription_status" AS ENUM('invited', 'subscribed', 'left');--> statement-breakpoint
CREATE TABLE "campaign_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"status" "campaign_subscription_status" DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone,
	"subscribed_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign_balances" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"lifetime" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "key" varchar(80);--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "enrollment_mode" "campaign_enrollment_mode" DEFAULT 'opt_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_subscriptions" ADD CONSTRAINT "campaign_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_subscriptions" ADD CONSTRAINT "campaign_subscriptions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_balances" ADD CONSTRAINT "campaign_balances_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_balances" ADD CONSTRAINT "campaign_balances_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_subscriptions_user_campaign_key" ON "campaign_subscriptions" USING btree ("user_id","campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_subscriptions_user_idx" ON "campaign_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campaign_subscriptions_campaign_idx" ON "campaign_subscriptions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_subscriptions_status_idx" ON "campaign_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_subscriptions_created_at_idx" ON "campaign_subscriptions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_balances_card_campaign_key" ON "campaign_balances" USING btree ("card_id","campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_balances_card_idx" ON "campaign_balances" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "campaign_balances_campaign_idx" ON "campaign_balances" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_key_key" ON "campaigns" USING btree ("key") WHERE "campaigns"."key" is not null;--> statement-breakpoint
CREATE INDEX "campaigns_enrollment_mode_idx" ON "campaigns" USING btree ("enrollment_mode");