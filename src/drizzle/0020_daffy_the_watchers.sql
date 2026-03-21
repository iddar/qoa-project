CREATE TYPE "public"."store_product_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."store_product_unit_type" AS ENUM('piece');--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid,
	"cpg_id" uuid,
	"name" varchar(200) NOT NULL,
	"sku" varchar(100),
	"unit_type" "store_product_unit_type" DEFAULT 'piece' NOT NULL,
	"price" varchar(20) NOT NULL,
	"status" "store_product_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_cpg_id_cpgs_id_fk" FOREIGN KEY ("cpg_id") REFERENCES "public"."cpgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_products_store_idx" ON "store_products" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_products_product_idx" ON "store_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "store_products_cpg_idx" ON "store_products" USING btree ("cpg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_products_store_sku_key" ON "store_products" USING btree ("store_id","sku");