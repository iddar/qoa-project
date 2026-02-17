CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'ready_for_review', 'in_review', 'rejected', 'confirmed', 'active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "campaign_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"action" varchar(60) NOT NULL,
	"notes" text,
	"actor_user_id" uuid,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"cpg_id" uuid,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaign_audit_logs" ADD CONSTRAINT "campaign_audit_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_audit_logs" ADD CONSTRAINT "campaign_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_audit_logs_campaign_idx" ON "campaign_audit_logs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_audit_logs_created_at_idx" ON "campaign_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "campaigns_cpg_idx" ON "campaigns" USING btree ("cpg_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_created_at_idx" ON "campaigns" USING btree ("created_at");