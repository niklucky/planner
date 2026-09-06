CREATE TABLE "app_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_groups" ADD CONSTRAINT "app_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: one group per existing app, reusing the app id as the group id.
INSERT INTO "app_groups" ("id", "project_id", "name") SELECT "id", "project_id", "name" FROM "apps";--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "group_id" uuid;--> statement-breakpoint
UPDATE "apps" SET "group_id" = "id";--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_group_id_app_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."app_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Releases move from (project, version) to (group, version). Rebuild them per group and copy notes.
ALTER TABLE "releases" DROP CONSTRAINT "releases_project_id_version_unique";--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "group_id" uuid;--> statement-breakpoint
INSERT INTO "releases" ("project_id", "group_id", "version", "notes_mode")
	SELECT DISTINCT a."project_id", a."group_id", v."version_string", COALESCE(r."notes_mode", 'shared')
	FROM "app_versions" v
	JOIN "apps" a ON a."id" = v."app_id"
	LEFT JOIN "releases" r ON r."id" = v."release_id";--> statement-breakpoint
INSERT INTO "release_notes" ("release_id", "scope", "locale", "text", "updated_at")
	SELECT n2."id", n."scope", n."locale", n."text", n."updated_at"
	FROM "release_notes" n
	JOIN "releases" old ON old."id" = n."release_id" AND old."group_id" IS NULL
	JOIN "releases" n2 ON n2."project_id" = old."project_id" AND n2."version" = old."version" AND n2."group_id" IS NOT NULL;--> statement-breakpoint
UPDATE "app_versions" v SET "release_id" = r."id"
	FROM "apps" a, "releases" r
	WHERE a."id" = v."app_id" AND r."group_id" = a."group_id" AND r."version" = v."version_string";--> statement-breakpoint
DELETE FROM "releases" WHERE "group_id" IS NULL;--> statement-breakpoint
ALTER TABLE "releases" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_group_id_app_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."app_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_group_id_version_unique" UNIQUE("group_id","version");
