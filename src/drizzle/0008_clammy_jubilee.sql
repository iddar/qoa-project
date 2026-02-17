ALTER TABLE "webhook_receipts" ADD COLUMN "replay_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_receipts" ADD COLUMN "last_received_at" timestamp with time zone;