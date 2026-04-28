CREATE TYPE "public"."store_checkin_status" AS ENUM('pending', 'matched', 'expired');--> statement-breakpoint
CREATE TABLE "store_checkins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "store_checkin_status" DEFAULT 'pending' NOT NULL,
	"matched_transaction_id" uuid,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "store_checkins" ADD CONSTRAINT "store_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_checkins" ADD CONSTRAINT "store_checkins_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_checkins" ADD CONSTRAINT "store_checkins_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_checkins_user_idx" ON "store_checkins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "store_checkins_store_idx" ON "store_checkins" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_checkins_status_idx" ON "store_checkins" USING btree ("status");--> statement-breakpoint
CREATE INDEX "store_checkins_expires_idx" ON "store_checkins" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "store_checkins_checked_in_idx" ON "store_checkins" USING btree ("checked_in_at");--> statement-breakpoint
CREATE INDEX "store_checkins_matched_tx_idx" ON "store_checkins" USING btree ("matched_transaction_id");