CREATE TYPE "public"."integration_provider" AS ENUM('app_store', 'google_play');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'error');--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"credentials" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "integration_status" DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_project_id_provider_unique" UNIQUE("project_id","provider")
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "integration_id" uuid;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_integration_id_external_id_unique" UNIQUE("integration_id","external_id");