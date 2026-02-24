-- Analytics RPC Functions: Response Times & Agent Performance
-- Implements the response-times and agent-performance analytics endpoints

-- Response time stats: For each incoming email, find the first non-internal-note sent-mail 
-- to the same customer by the same client, and compute the time difference.
-- Returns average, median (p50), p90, and p99 response times in minutes, grouped by day.
CREATE OR REPLACE FUNCTION get_response_time_stats(
  p_client_id INT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  avg_response_minutes NUMERIC,
  median_response_minutes NUMERIC,
  p90_response_minutes NUMERIC,
  total_responded BIGINT,
  total_unresponded BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH first_responses AS (
    SELECT
      im.id AS incoming_id,
      date_trunc('day', im.send_at)::date AS day,
      im.send_at AS incoming_at,
      MIN(sm.send_at) AS first_response_at
    FROM "incoming-mails" im
    LEFT JOIN "sent-mail" sm
      ON sm.customer_id = im.customer_id
      AND sm.send_at > im.send_at
      AND sm.is_internal_note = false
    WHERE im.client_id = p_client_id
      AND im.send_at >= p_from
      AND im.send_at <= p_to
    GROUP BY im.id, im.send_at
  ),
  with_durations AS (
    SELECT
      day,
      CASE WHEN first_response_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (first_response_at - incoming_at)) / 60.0
        ELSE NULL
      END AS response_minutes,
      CASE WHEN first_response_at IS NOT NULL THEN 1 ELSE 0 END AS responded,
      CASE WHEN first_response_at IS NULL THEN 1 ELSE 0 END AS unresponded
    FROM first_responses
  )
  SELECT
    day,
    ROUND(AVG(response_minutes) FILTER (WHERE response_minutes IS NOT NULL), 1) AS avg_response_minutes,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes) FILTER (WHERE response_minutes IS NOT NULL), 1) AS median_response_minutes,
    ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_minutes) FILTER (WHERE response_minutes IS NOT NULL), 1) AS p90_response_minutes,
    SUM(responded)::BIGINT AS total_responded,
    SUM(unresponded)::BIGINT AS total_unresponded
  FROM with_durations
  GROUP BY day
  ORDER BY day;
$$;

-- Agent performance stats: Per-employee metrics including emails sent, avg response time, 
-- tickets resolved (status changed to 'resolved' by agent response)
CREATE OR REPLACE FUNCTION get_agent_performance_stats(
  p_client_id INT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  employee_id INT,
  employee_name TEXT,
  emails_sent BIGINT,
  internal_notes BIGINT,
  avg_response_minutes NUMERIC,
  tickets_resolved BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH agent_emails AS (
    SELECT
      e.id AS emp_id,
      e.name AS emp_name,
      COUNT(*) FILTER (WHERE sm.is_internal_note = false) AS emails_sent,
      COUNT(*) FILTER (WHERE sm.is_internal_note = true) AS internal_notes
    FROM "sent-mail" sm
    JOIN employees e ON e.id = sm.employee_id
    JOIN customers c ON c.id = sm.customer_id
    WHERE c.client_id = p_client_id
      AND sm.send_at >= p_from
      AND sm.send_at <= p_to
    GROUP BY e.id, e.name
  ),
  response_times AS (
    SELECT
      sm.employee_id AS emp_id,
      EXTRACT(EPOCH FROM (sm.send_at - im.send_at)) / 60.0 AS response_minutes
    FROM "sent-mail" sm
    JOIN customers c ON c.id = sm.customer_id
    JOIN "incoming-mails" im ON im.customer_id = sm.customer_id
      AND im.send_at < sm.send_at
      AND im.client_id = p_client_id
    WHERE c.client_id = p_client_id
      AND sm.send_at >= p_from
      AND sm.send_at <= p_to
      AND sm.is_internal_note = false
      -- Only match first response per incoming mail
      AND NOT EXISTS (
        SELECT 1 FROM "sent-mail" sm2
        WHERE sm2.customer_id = sm.customer_id
          AND sm2.send_at > im.send_at
          AND sm2.send_at < sm.send_at
          AND sm2.is_internal_note = false
      )
  ),
  avg_resp AS (
    SELECT emp_id, ROUND(AVG(response_minutes), 1) AS avg_response_minutes
    FROM response_times
    WHERE response_minutes > 0
    GROUP BY emp_id
  ),
  resolved_counts AS (
    SELECT
      sm.employee_id AS emp_id,
      COUNT(DISTINCT im.customer_id) AS tickets_resolved
    FROM "sent-mail" sm
    JOIN customers c ON c.id = sm.customer_id
    JOIN "incoming-mails" im ON im.customer_id = sm.customer_id AND im.status = 'resolved'
    WHERE c.client_id = p_client_id
      AND sm.send_at >= p_from
      AND sm.send_at <= p_to
      AND sm.is_internal_note = false
    GROUP BY sm.employee_id
  )
  SELECT
    ae.emp_id AS employee_id,
    ae.emp_name AS employee_name,
    ae.emails_sent,
    ae.internal_notes,
    COALESCE(ar.avg_response_minutes, 0) AS avg_response_minutes,
    COALESCE(rc.tickets_resolved, 0) AS tickets_resolved
  FROM agent_emails ae
  LEFT JOIN avg_resp ar ON ar.emp_id = ae.emp_id
  LEFT JOIN resolved_counts rc ON rc.emp_id = ae.emp_id
  ORDER BY ae.emails_sent DESC;
$$;
