-- RLS on every table with no policy: the Supabase Data API (anon key) cannot read case data (AC-DB-03).
-- The app's own role owns the tables and is not subject to RLS.
ALTER TABLE "paypal_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "raw_payloads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fulfilment_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- audit_log is append-only for every role, including the owner (AC-NFR-08).
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();--> statement-breakpoint

-- Analytics views for the AG Studio dashboard: explicit column allow-list, no PII (04 section 2.12a).
CREATE VIEW v_analytics_disputes AS
  SELECT d.id, d.reason, d.paypal_status, c.state AS case_state, d.amount_minor, d.currency,
         d.seller_response_due,
         round(extract(epoch FROM (d.seller_response_due - now())) / 3600.0, 1) AS hours_to_due,
         c.strength,
         (SELECT dr.verifier_passed FROM drafts dr WHERE dr.case_id = c.id ORDER BY dr.version DESC LIMIT 1) AS verifier_passed
  FROM disputes d LEFT JOIN cases c ON c.dispute_id = d.id;--> statement-breakpoint
CREATE VIEW v_analytics_evidence_items AS
  SELECT c.dispute_id, item->>'key' AS item_key, item->>'status' AS status, (item->>'blocking')::boolean AS required
  FROM cases c, jsonb_array_elements(coalesce(c.checklist, '[]'::jsonb)) AS item;--> statement-breakpoint
CREATE VIEW v_analytics_statements AS
  WITH latest AS (
    SELECT DISTINCT ON (case_id) case_id, verifier_report FROM drafts ORDER BY case_id, version DESC
  )
  SELECT c.dispute_id, true AS accepted, NULL::text AS reject_reason,
         jsonb_array_length(s->'factKeys') AS fact_key_count
  FROM latest l JOIN cases c ON c.id = l.case_id, jsonb_array_elements(l.verifier_report->'accepted') AS s
  UNION ALL
  SELECT c.dispute_id, false, r->>'reason', jsonb_array_length(r->'statement'->'factKeys')
  FROM latest l JOIN cases c ON c.id = l.case_id, jsonb_array_elements(l.verifier_report->'rejected') AS r;--> statement-breakpoint
CREATE VIEW v_analytics_risk_flags AS
  SELECT f.rule, t.amount_minor AS order_value_minor, t.currency, f.status, f.first_seen_at AS created_at
  FROM risk_flags f JOIN transactions t ON t.id = f.transaction_id;
