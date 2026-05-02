CREATE TYPE "public"."notification_delivery_channel" AS ENUM('whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"notification_key" text NOT NULL,
	"channel" "notification_delivery_channel" NOT NULL,
	"recipient" text NOT NULL,
	"provider_message_id" text,
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"metadata" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_key" ON "notification_deliveries" USING btree ("notification_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_channel_idx" ON "notification_deliveries" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_deliveries_recipient_idx" ON "notification_deliveries" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cards_user_universal_campaign_key" ON "cards" USING btree ("user_id","campaign_id") WHERE "cards"."store_id" is null;--> statement-breakpoint
CREATE INDEX "transactions_store_created_id_idx" ON "transactions" USING btree ("store_id","created_at","id");--> statement-breakpoint
CREATE INDEX "transactions_user_created_id_idx" ON "transactions" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "accumulations_campaign_created_idx" ON "accumulations" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_card_reward_key" ON "redemptions" USING btree ("card_id","reward_id");--> statement-breakpoint
CREATE INDEX "redemptions_reward_created_idx" ON "redemptions" USING btree ("reward_id","created_at");--> statement-breakpoint
CREATE INDEX "rewards_campaign_status_created_idx" ON "rewards" USING btree ("campaign_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reminder_jobs_status_scheduled_idx" ON "reminder_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "reminder_jobs_status_created_idx" ON "reminder_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_status_received_idx" ON "whatsapp_messages" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "store_checkins_store_status_expires_checked_idx" ON "store_checkins" USING btree ("store_id","status","expires_at","checked_in_at");--> statement-breakpoint
CREATE INDEX "store_checkins_user_store_status_expires_checked_idx" ON "store_checkins" USING btree ("user_id","store_id","status","expires_at","checked_in_at");