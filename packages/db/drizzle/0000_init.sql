CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"case_id" uuid,
	"dispute_id" text,
	"flag_id" uuid,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" text NOT NULL,
	"state" text NOT NULL,
	"strength" text,
	"checklist" jsonb,
	"recommended_action" text,
	"needs_info" jsonb,
	"decision" jsonb,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"outcome_note" text,
	"error_detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_dispute_id_unique" UNIQUE("dispute_id")
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"paypal_status" text NOT NULL,
	"dispute_state" text,
	"stage" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"disputed_transaction_id" text,
	"buyer_masked" text,
	"created_at_paypal" timestamp with time zone,
	"updated_at_paypal" timestamp with time zone,
	"seller_response_due" timestamp with time zone,
	"allowed_actions" text[] DEFAULT '{}'::text[] NOT NULL,
	"outcome_code" text,
	"latest_payload_id" uuid,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"origin" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"content" jsonb NOT NULL,
	"notes_text" text NOT NULL,
	"verifier_report" jsonb NOT NULL,
	"verifier_passed" boolean NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" jsonb NOT NULL,
	"display" text NOT NULL,
	"source_payload_id" uuid,
	"source_path" text,
	"confidence" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfilment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_ref" text NOT NULL,
	"paypal_transaction_id" text NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_scan_at" timestamp with time zone,
	"ship_to_name" text,
	"ship_to_line1" text,
	"ship_to_city" text,
	"ship_to_postal" text,
	"ship_to_country" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_batch" uuid NOT NULL,
	CONSTRAINT "fulfilment_records_paypal_transaction_id_unique" UNIQUE("paypal_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"backend" text DEFAULT 'postgres' NOT NULL,
	"external_run_id" text,
	"dedupe_key" text,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paypal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified" boolean NOT NULL,
	"verification_detail" text,
	"headers" jsonb NOT NULL,
	"body_raw" text NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"ref" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"sha256" char(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" text NOT NULL,
	"rule" text NOT NULL,
	"severity" text NOT NULL,
	"reason" text NOT NULL,
	"fact_refs" jsonb NOT NULL,
	"status" text NOT NULL,
	"suggested_action" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"draft_id" uuid,
	"flag_id" uuid,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"request_snapshot" jsonb NOT NULL,
	"response_snapshot" jsonb,
	"idempotency_key" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"error_detail" text,
	CONSTRAINT "submissions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "submissions_draft_required" CHECK ("submissions"."draft_id" IS NOT NULL OR "submissions"."action" IN ('ACCEPT_CLAIM','ADD_TRACKING','REFUND'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"capture_id" text,
	"invoice_id" text,
	"custom_field" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" text,
	"protection_eligibility" text,
	"ship_to_name" text,
	"ship_to_line1" text,
	"ship_to_city" text,
	"ship_to_postal" text,
	"ship_to_country" text,
	"items" jsonb,
	"tracking_on_paypal" boolean DEFAULT false NOT NULL,
	"payload_id" uuid,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_latest_payload_id_raw_payloads_id_fk" FOREIGN KEY ("latest_payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_payload_id_raw_payloads_id_fk" FOREIGN KEY ("source_payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payload_id_raw_payloads_id_fk" FOREIGN KEY ("payload_id") REFERENCES "public"."raw_payloads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("paypal_status");--> statement-breakpoint
CREATE INDEX "disputes_due_idx" ON "disputes" USING btree ("seller_response_due");--> statement-breakpoint
CREATE INDEX "disputes_txn_idx" ON "disputes" USING btree ("disputed_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_case_version_idx" ON "drafts" USING btree ("case_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "facts_case_key_at_idx" ON "facts" USING btree ("case_id","key","collected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_active_idx" ON "jobs" USING btree ("dedupe_key") WHERE "jobs"."status" IN ('QUEUED','RUNNING');--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "raw_payloads_source_ref_idx" ON "raw_payloads" USING btree ("source","ref","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "raw_payloads_dedupe_idx" ON "raw_payloads" USING btree ("source","ref","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_flags_open_idx" ON "risk_flags" USING btree ("transaction_id","rule") WHERE "risk_flags"."status" = 'OPEN';