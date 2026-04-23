-- Required extensions (Supabase enables pgcrypto by default; vector needs explicit enable)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TYPE "public"."industry" AS ENUM('dental', 'medical_beauty', 'maternity', 'hair_transplant', 'law', 'accounting', 'education', 'hospital', 'fitness', 'pet', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'operator', 'auditor', 'staff');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('trial', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('doctor', 'consultant', 'receptionist', 'marketing', 'nurse', 'other');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'paused', 'offboarding');--> statement-breakpoint
CREATE TYPE "public"."vocab_type" AS ENUM('brand', 'doctor', 'service', 'location_alias', 'competitor');--> statement-breakpoint
CREATE TYPE "public"."compliance_status" AS ENUM('pending', 'auto_approved', 'manual_approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."content_item_status" AS ENUM('draft', 'parsed', 'variant_generated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."content_source_type" AS ENUM('word', 'pdf', 'manual', 'url_import');--> statement-breakpoint
CREATE TYPE "public"."geo_tactic" AS ENUM('add_quotation', 'add_statistics', 'fluency_optimization', 'cite_sources', 'authoritative', 'technical_terms', 'easy_to_understand', 'unique_words', 'keyword_stuffing');--> statement-breakpoint
CREATE TYPE "public"."variant_platform" AS ENUM('toutiao_article', 'douyin_script', 'wechat_mp', 'zhihu', 'xiaohongshu', 'baijiahao', 'souhu');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('draft', 'pending_review', 'auto_approved', 'manual_approved', 'approved', 'rejected', 'scheduled', 'dispatched', 'archived');--> statement-breakpoint
CREATE TYPE "public"."publish_task_status" AS ENUM('pending', 'dispatched', 'published', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."engine" AS ENUM('doubao', 'yuanbao', 'quark', 'deepseek', 'kimi', 'wenxin', 'qwen', 'chatgpt', 'perplexity');--> statement-breakpoint
CREATE TYPE "public"."question_intent" AS ENUM('local_recommendation', 'price_inquiry', 'procedure_info', 'doctor_review', 'comparison', 'risk_concern', 'aftercare', 'other');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('pending', 'running', 'done', 'failed', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."tracking_account_status" AS ENUM('active', 'rate_limited', 'banned', 'retired');--> statement-breakpoint
CREATE TYPE "public"."keyword_level" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."review_stage" AS ENUM('keyword', 'llm', 'manual');--> statement-breakpoint
CREATE TYPE "public"."review_target_type" AS ENUM('content_variant');--> statement-breakpoint
CREATE TYPE "public"."review_verdict" AS ENUM('pass', 'warn', 'reject');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."conversion_stage" AS ENUM('arrived', 'consulted', 'treated', 'paid', 'lost');--> statement-breakpoint
CREATE TYPE "public"."hook_type" AS ENUM('doctor_name', 'activity_code', 'phone_tail', 'utm_qrcode');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"industry" "industry" DEFAULT 'other' NOT NULL,
	"plan" "plan" DEFAULT 'trial' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_vocab" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"term" text NOT NULL,
	"term_type" "vocab_type" NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contact_phones" text[] DEFAULT '{}' NOT NULL,
	"wecom_qr_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"real_name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"persona" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"auth_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" "content_source_type" NOT NULL,
	"source_url" text,
	"markdown" text DEFAULT '' NOT NULL,
	"topics" text[] DEFAULT '{}' NOT NULL,
	"target_questions" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "content_item_status" DEFAULT 'draft' NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"platform" "variant_platform" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cover_image_url" text,
	"extra_assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"geo_tactics" "geo_tactic"[] DEFAULT '{}' NOT NULL,
	"compliance_status" "compliance_status" DEFAULT 'pending' NOT NULL,
	"compliance_review_id" uuid,
	"status" "variant_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "publish_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"staff_account_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"published_url" text,
	"status" "publish_task_status" DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"brand_mentioned" boolean NOT NULL,
	"mention_position" integer,
	"mention_text" text,
	"matched_task_id" uuid,
	"match_confidence" double precision,
	"sentiment" "sentiment",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"engine" "engine" NOT NULL,
	"session_account_id" uuid,
	"asked_at" timestamp with time zone,
	"raw_response" text,
	"citation_urls" text[] DEFAULT '{}' NOT NULL,
	"status" "snapshot_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brand_id" uuid,
	"text" text NOT NULL,
	"intent" "question_intent" DEFAULT 'other' NOT NULL,
	"city" text,
	"category" text,
	"priority" integer DEFAULT 5 NOT NULL,
	"embedding" vector(1536),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracking_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine" "engine" NOT NULL,
	"nickname" text NOT NULL,
	"credential_ref" text NOT NULL,
	"daily_quota" integer DEFAULT 50 NOT NULL,
	"last_used_at" timestamp with time zone,
	"status" "tracking_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"term" text NOT NULL,
	"level" "keyword_level" NOT NULL,
	"category" text NOT NULL,
	"variants" text[] DEFAULT '{}' NOT NULL,
	"context_exempt" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target_type" "review_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"stage" "review_stage" NOT NULL,
	"verdict" "review_verdict" NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewer_id" uuid,
	"llm_response_raw" text,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversion_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hook_id" uuid,
	"stage" "conversion_stage" NOT NULL,
	"stage_at" timestamp with time zone NOT NULL,
	"amount_cents" bigint,
	"patient_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"publish_task_id" uuid NOT NULL,
	"hook_type" "hook_type" NOT NULL,
	"hook_value" text NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_uq" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_vocab_tenant_idx" ON "brand_vocab" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brands_tenant_idx" ON "brands" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_accounts_tenant_idx" ON "staff_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_accounts_brand_idx" ON "staff_accounts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_accounts_auth_idx" ON "staff_accounts" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_items_tenant_status_idx" ON "content_items" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_variants_tenant_idx" ON "content_variants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_variants_content_item_idx" ON "content_variants" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_variants_status_idx" ON "content_variants" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_tasks_tenant_status_idx" ON "publish_tasks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_tasks_staff_status_idx" ON "publish_tasks" USING btree ("staff_account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publish_tasks_tenant_published_idx" ON "publish_tasks" USING btree ("tenant_id","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "citations_snapshot_idx" ON "citations" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "citations_matched_task_idx" ON "citations" USING btree ("matched_task_id") WHERE matched_task_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_snapshots_question_time_idx" ON "geo_snapshots" USING btree ("question_id","asked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_snapshots_tenant_engine_idx" ON "geo_snapshots" USING btree ("tenant_id","engine");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_snapshots_status_idx" ON "geo_snapshots" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_tenant_active_idx" ON "questions" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_priority_idx" ON "questions" USING btree ("tenant_id","priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_keywords_tenant_term_idx" ON "compliance_keywords" USING btree ("tenant_id","term");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_keywords_level_idx" ON "compliance_keywords" USING btree ("level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_reviews_tenant_target_idx" ON "compliance_reviews" USING btree ("tenant_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_reviews_stage_idx" ON "compliance_reviews" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversion_events_tenant_stage_idx" ON "conversion_events" USING btree ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversion_events_hook_stage_idx" ON "conversion_events" USING btree ("hook_id","stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hooks_tenant_idx" ON "hooks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hooks_task_idx" ON "hooks" USING btree ("publish_task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hooks_type_value_idx" ON "hooks" USING btree ("hook_type","hook_value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_action_idx" ON "audit_logs" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");