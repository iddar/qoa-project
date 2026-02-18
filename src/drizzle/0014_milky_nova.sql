CREATE TYPE "public"."alert_notification_channel" AS ENUM('email');--> statement-breakpoint
CREATE TYPE "public"."alert_notification_status" AS ENUM('mocked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "alert_notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel" "alert_notification_channel" DEFAULT 'email' NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"alert_code" text NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_notification_status" DEFAULT 'mocked' NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alert_notifications_channel_idx" ON "alert_notifications" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "alert_notifications_severity_idx" ON "alert_notifications" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "alert_notifications_status_idx" ON "alert_notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alert_notifications_created_at_idx" ON "alert_notifications" USING btree ("created_at");