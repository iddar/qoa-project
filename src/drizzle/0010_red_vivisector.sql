CREATE TYPE "public"."accumulation_source_type" AS ENUM('transaction_item', 'code_capture');--> statement-breakpoint
CREATE TABLE "accumulations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"transaction_item_id" uuid,
	"card_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"source_type" "accumulation_source_type" NOT NULL,
	"code_capture_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balances" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"lifetime" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accumulations" ADD CONSTRAINT "accumulations_transaction_item_id_transaction_items_id_fk" FOREIGN KEY ("transaction_item_id") REFERENCES "public"."transaction_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accumulations" ADD CONSTRAINT "accumulations_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accumulations" ADD CONSTRAINT "accumulations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balances" ADD CONSTRAINT "balances_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accumulations_tx_item_idx" ON "accumulations" USING btree ("transaction_item_id");--> statement-breakpoint
CREATE INDEX "accumulations_card_idx" ON "accumulations" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "accumulations_campaign_idx" ON "accumulations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "accumulations_source_idx" ON "accumulations" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "accumulations_created_at_idx" ON "accumulations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "balances_card_key" ON "balances" USING btree ("card_id");