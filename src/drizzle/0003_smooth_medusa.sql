ALTER TYPE "public"."user_role" ADD VALUE 'qoa_support' BEFORE 'qoa_admin';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_type" "tenant_type";--> statement-breakpoint
CREATE INDEX "users_tenant_idx" ON "users" USING btree ("tenant_id","tenant_type");