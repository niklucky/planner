CREATE TYPE "public"."note_scope" AS ENUM('shared', 'ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."notes_mode" AS ENUM('shared', 'per_platform');--> statement-breakpoint
CREATE TABLE "app_version_localizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_version_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"locale" text NOT NULL,
	"whats_new" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_version_localizations_app_version_id_locale_unique" UNIQUE("app_version_id","locale")
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"scope" "note_scope" DEFAULT 'shared' NOT NULL,
	"locale" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_notes_release_id_scope_locale_unique" UNIQUE("release_id","scope","locale")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" text NOT NULL,
	"notes_mode" "notes_mode" DEFAULT 'shared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_project_id_version_unique" UNIQUE("project_id","version")
);
--> statement-breakpoint
ALTER TABLE "app_versions" ADD COLUMN "release_id" uuid;--> statement-breakpoint
ALTER TABLE "app_version_localizations" ADD CONSTRAINT "app_version_localizations_app_version_id_app_versions_id_fk" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_versions" ADD CONSTRAINT "app_versions_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action;