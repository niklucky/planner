CREATE TABLE "project_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_production" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_environments_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "onboarding_deployments" (
	"onboarding_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deployed_by" uuid,
	CONSTRAINT "onboarding_deployments_onboarding_id_environment_id_pk" PRIMARY KEY("onboarding_id","environment_id")
);
--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "environment_id" uuid;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_deployments" ADD CONSTRAINT "onboarding_deployments_onboarding_id_onboardings_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_deployments" ADD CONSTRAINT "onboarding_deployments_environment_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_deployments" ADD CONSTRAINT "onboarding_deployments_release_id_onboarding_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."onboarding_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_deployments" ADD CONSTRAINT "onboarding_deployments_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_environments_one_production" ON "project_environments" USING btree ("project_id") WHERE "project_environments"."is_production";--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD CONSTRAINT "project_api_keys_environment_id_project_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."project_environments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Every project starts with Production and Development.
INSERT INTO "project_environments" ("project_id", "name", "is_production")
SELECT "id", 'Production', true FROM "projects";--> statement-breakpoint
INSERT INTO "project_environments" ("project_id", "name", "is_production")
SELECT "id", 'Development', false FROM "projects";--> statement-breakpoint
-- Keys made so far are the store builds' keys.
UPDATE "project_api_keys" k SET "environment_id" = e."id"
FROM "project_environments" e
WHERE e."project_id" = k."project_id" AND e."is_production";--> statement-breakpoint
ALTER TABLE "project_api_keys" ALTER COLUMN "environment_id" SET NOT NULL;--> statement-breakpoint
-- Production keeps serving what apps get today: each onboarding's latest release.
INSERT INTO "onboarding_deployments" ("onboarding_id", "environment_id", "release_id", "deployed_at", "deployed_by")
SELECT DISTINCT ON (r."onboarding_id") r."onboarding_id", e."id", r."id", r."published_at", r."published_by"
FROM "onboarding_releases" r
JOIN "onboardings" o ON o."id" = r."onboarding_id"
JOIN "project_environments" e ON e."project_id" = o."project_id" AND e."is_production"
ORDER BY r."onboarding_id", r."revision" DESC;