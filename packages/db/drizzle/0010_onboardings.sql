CREATE TABLE "app_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"app_group_id" uuid NOT NULL,
	"profile" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_profiles_app_group_id_unique" UNIQUE("app_group_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_default_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"machine" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_default_labels_onboarding_id_locale_unique" UNIQUE("onboarding_id","locale")
);
--> statement-breakpoint
CREATE TABLE "onboarding_page_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"action_labels" text[] DEFAULT '{}' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"machine" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_page_copy_page_id_locale_unique" UNIQUE("page_id","locale")
);
--> statement-breakpoint
CREATE TABLE "onboarding_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"actions" text[],
	"platforms" text[] DEFAULT '{}' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_pages_onboarding_id_key_unique" UNIQUE("onboarding_id","key")
);
--> statement-breakpoint
CREATE TABLE "onboarding_release_files" (
	"release_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "onboarding_release_files_release_id_file_id_pk" PRIMARY KEY("release_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"revision" integer NOT NULL,
	"default_locale" text NOT NULL,
	"document" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	CONSTRAINT "onboarding_releases_onboarding_id_revision_unique" UNIQUE("onboarding_id","revision")
);
--> statement-breakpoint
CREATE TABLE "onboardings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"app_group_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"default_locale" text NOT NULL,
	"locales" text[] DEFAULT '{}' NOT NULL,
	"default_actions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboardings_project_id_key_unique" UNIQUE("project_id","key")
);
--> statement-breakpoint
CREATE TABLE "project_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_api_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "app_profiles" ADD CONSTRAINT "app_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_profiles" ADD CONSTRAINT "app_profiles_app_group_id_app_groups_id_fk" FOREIGN KEY ("app_group_id") REFERENCES "public"."app_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_default_labels" ADD CONSTRAINT "onboarding_default_labels_onboarding_id_onboardings_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_page_copy" ADD CONSTRAINT "onboarding_page_copy_page_id_onboarding_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."onboarding_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_pages" ADD CONSTRAINT "onboarding_pages_onboarding_id_onboardings_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_release_files" ADD CONSTRAINT "onboarding_release_files_release_id_onboarding_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."onboarding_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_release_files" ADD CONSTRAINT "onboarding_release_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_releases" ADD CONSTRAINT "onboarding_releases_onboarding_id_onboardings_id_fk" FOREIGN KEY ("onboarding_id") REFERENCES "public"."onboardings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_releases" ADD CONSTRAINT "onboarding_releases_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_app_group_id_app_groups_id_fk" FOREIGN KEY ("app_group_id") REFERENCES "public"."app_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD CONSTRAINT "project_api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD CONSTRAINT "project_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;