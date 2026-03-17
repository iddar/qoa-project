CREATE TYPE "public"."campaign_store_access_mode" AS ENUM('all_related_stores', 'selected_stores');--> statement-breakpoint
CREATE TYPE "public"."campaign_store_enrollment_mode" AS ENUM('store_opt_in', 'cpg_managed', 'auto_enroll');--> statement-breakpoint
CREATE TYPE "public"."campaign_store_enrollment_source" AS ENUM('cpg_managed', 'store_opt_in', 'auto_enroll');--> statement-breakpoint
CREATE TYPE "public"."campaign_store_enrollment_status" AS ENUM('visible', 'invited', 'enrolled', 'declined', 'removed', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."campaign_store_visibility_source" AS ENUM('manual', 'zone', 'import', 'auto_related');--> statement-breakpoint
CREATE TYPE "public"."cpg_store_relation_source" AS ENUM('first_activity', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."cpg_store_relation_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "campaign_store_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "campaign_store_enrollment_status" DEFAULT 'visible' NOT NULL,
	"visibility_source" "campaign_store_visibility_source" DEFAULT 'manual' NOT NULL,
	"enrollment_source" "campaign_store_enrollment_source",
	"invited_by_user_id" uuid,
	"enrolled_by_user_id" uuid,
	"invited_at" timestamp with time zone,
	"enrolled_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cpg_store_relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cpg_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "cpg_store_relation_status" DEFAULT 'active' NOT NULL,
	"source" "cpg_store_relation_source" DEFAULT 'first_activity' NOT NULL,
	"first_activity_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "store_access_mode" "campaign_store_access_mode" DEFAULT 'selected_stores' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "store_enrollment_mode" "campaign_store_enrollment_mode" DEFAULT 'store_opt_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpg_store_relations" ADD CONSTRAINT "cpg_store_relations_cpg_id_cpgs_id_fk" FOREIGN KEY ("cpg_id") REFERENCES "public"."cpgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpg_store_relations" ADD CONSTRAINT "cpg_store_relations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cpg_store_relations" ADD CONSTRAINT "cpg_store_relations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_store_enrollments_campaign_store_key" ON "campaign_store_enrollments" USING btree ("campaign_id","store_id");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_campaign_idx" ON "campaign_store_enrollments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_store_idx" ON "campaign_store_enrollments" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_status_idx" ON "campaign_store_enrollments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_visibility_source_idx" ON "campaign_store_enrollments" USING btree ("visibility_source");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_enrollment_source_idx" ON "campaign_store_enrollments" USING btree ("enrollment_source");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_updated_at_idx" ON "campaign_store_enrollments" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cpg_store_relations_cpg_store_key" ON "cpg_store_relations" USING btree ("cpg_id","store_id");--> statement-breakpoint
CREATE INDEX "cpg_store_relations_cpg_idx" ON "cpg_store_relations" USING btree ("cpg_id");--> statement-breakpoint
CREATE INDEX "cpg_store_relations_store_idx" ON "cpg_store_relations" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "cpg_store_relations_status_idx" ON "cpg_store_relations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cpg_store_relations_source_idx" ON "cpg_store_relations" USING btree ("source");--> statement-breakpoint
CREATE INDEX "cpg_store_relations_last_activity_idx" ON "cpg_store_relations" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "campaigns_store_access_mode_idx" ON "campaigns" USING btree ("store_access_mode");--> statement-breakpoint
CREATE INDEX "campaigns_store_enrollment_mode_idx" ON "campaigns" USING btree ("store_enrollment_mode");