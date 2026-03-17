ALTER TABLE "stores" ADD COLUMN "street" varchar(255);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "exterior_number" varchar(20);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "interior_number" varchar(20);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "neighborhood" varchar(150);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "city" varchar(150);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "state" varchar(100);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "postal_code" varchar(10);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "country" varchar(3) DEFAULT 'MEX';--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
CREATE INDEX "stores_lat_lng_idx" ON "stores" USING btree ("latitude","longitude");