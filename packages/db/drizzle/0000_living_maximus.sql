CREATE TYPE "public"."platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"platform" "platform" NOT NULL,
	"bundle_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
