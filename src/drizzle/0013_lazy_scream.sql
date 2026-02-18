CREATE TYPE "public"."reminder_job_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."reminder_job_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_message_status" AS ENUM('received', 'processed', 'error', 'replayed');--> statement-breakpoint
CREATE TABLE "reminder_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"channel" "reminder_job_channel" DEFAULT 'whatsapp' NOT NULL,
	"status" "reminder_job_status" DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"payload" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text DEFAULT 'meta' NOT NULL,
	"external_message_id" text NOT NULL,
	"direction" "whatsapp_direction" DEFAULT 'inbound' NOT NULL,
	"from_phone" text NOT NULL,
	"to_phone" text NOT NULL,
	"text_body" text,
	"payload" text NOT NULL,
	"status" "whatsapp_message_status" DEFAULT 'received' NOT NULL,
	"replay_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_received_at" timestamp with time zone,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_jobs_idempotency_key" ON "reminder_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "reminder_jobs_card_idx" ON "reminder_jobs" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "reminder_jobs_campaign_idx" ON "reminder_jobs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "reminder_jobs_channel_idx" ON "reminder_jobs" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "reminder_jobs_status_idx" ON "reminder_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reminder_jobs_scheduled_for_idx" ON "reminder_jobs" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "reminder_jobs_created_at_idx" ON "reminder_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_provider_external_key" ON "whatsapp_messages" USING btree ("provider","external_message_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_status_idx" ON "whatsapp_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_received_at_idx" ON "whatsapp_messages" USING btree ("received_at");