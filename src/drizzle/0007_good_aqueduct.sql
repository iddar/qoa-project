CREATE TABLE "webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source" text NOT NULL,
	"hash" text NOT NULL,
	"external_event_id" text,
	"transaction_id" uuid,
	"payload" text NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "webhook_receipts" ADD CONSTRAINT "webhook_receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_receipts_hash_key" ON "webhook_receipts" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "webhook_receipts_source_idx" ON "webhook_receipts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "webhook_receipts_tx_idx" ON "webhook_receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "webhook_receipts_received_at_idx" ON "webhook_receipts" USING btree ("received_at");