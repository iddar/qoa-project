CREATE TYPE "public"."user_store_enrollment_source" AS ENUM('whatsapp_qr');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_onboarding_state" AS ENUM('awaiting_store', 'awaiting_name', 'awaiting_birth_date', 'completed');--> statement-breakpoint
CREATE TABLE "user_store_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"source" "user_store_enrollment_source" DEFAULT 'whatsapp_qr' NOT NULL,
	"first_enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrollment_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_onboarding_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"user_id" uuid,
	"pending_store_id" uuid,
	"state" "whatsapp_onboarding_state" DEFAULT 'awaiting_store' NOT NULL,
	"last_inbound_message_id" varchar(64),
	"last_inbound_at" timestamp with time zone,
	"last_outbound_message_id" varchar(64),
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "user_store_enrollments" ADD CONSTRAINT "user_store_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_store_enrollments" ADD CONSTRAINT "user_store_enrollments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_onboarding_sessions" ADD CONSTRAINT "whatsapp_onboarding_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_onboarding_sessions" ADD CONSTRAINT "whatsapp_onboarding_sessions_pending_store_id_stores_id_fk" FOREIGN KEY ("pending_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_store_enrollments_user_store_key" ON "user_store_enrollments" USING btree ("user_id","store_id");--> statement-breakpoint
CREATE INDEX "user_store_enrollments_user_idx" ON "user_store_enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_store_enrollments_store_idx" ON "user_store_enrollments" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "user_store_enrollments_source_idx" ON "user_store_enrollments" USING btree ("source");--> statement-breakpoint
CREATE INDEX "user_store_enrollments_first_enrolled_idx" ON "user_store_enrollments" USING btree ("first_enrolled_at");--> statement-breakpoint
CREATE INDEX "user_store_enrollments_last_enrolled_idx" ON "user_store_enrollments" USING btree ("last_enrolled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_onboarding_sessions_phone_key" ON "whatsapp_onboarding_sessions" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "whatsapp_onboarding_sessions_user_idx" ON "whatsapp_onboarding_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "whatsapp_onboarding_sessions_pending_store_idx" ON "whatsapp_onboarding_sessions" USING btree ("pending_store_id");--> statement-breakpoint
CREATE INDEX "whatsapp_onboarding_sessions_state_idx" ON "whatsapp_onboarding_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "whatsapp_onboarding_sessions_last_inbound_idx" ON "whatsapp_onboarding_sessions" USING btree ("last_inbound_at");--> statement-breakpoint
CREATE INDEX "whatsapp_onboarding_sessions_completed_idx" ON "whatsapp_onboarding_sessions" USING btree ("completed_at");