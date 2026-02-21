-- Analytics RPC Functions
-- These functions push aggregation to the database instead of loading all rows into JS memory (B4 fix)

-- Daily email stats: returns incoming and sent counts grouped by day
CREATE OR REPLACE FUNCTION get_daily_email_stats(
  p_client_id INT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  incoming BIGINT,
  sent BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH incoming_counts AS (
    SELECT date_trunc('day', send_at)::date AS day, count(*) AS cnt
    FROM "incoming-mails"
    WHERE client_id = p_client_id
      AND send_at >= p_from
      AND send_at <= p_to
    GROUP BY 1
  ),
  -- For sent emails, we join through customers to scope to the client
  sent_counts AS (
    SELECT date_trunc('day', sm.send_at)::date AS day, count(*) AS cnt
    FROM "sent-mail" sm
    JOIN customers c ON c.id = sm.customer_id
    WHERE c.client_id = p_client_id
      AND sm.send_at >= p_from
      AND sm.send_at <= p_to
    GROUP BY 1
  )
  SELECT
    COALESCE(i.day, s.day) AS day,
    COALESCE(i.cnt, 0) AS incoming,
    COALESCE(s.cnt, 0) AS sent
  FROM incoming_counts i
  FULL OUTER JOIN sent_counts s ON i.day = s.day
  ORDER BY day;
$$;

-- Employee sent-email stats: returns counts grouped by employee and day
CREATE OR REPLACE FUNCTION get_employee_email_stats(
  p_client_id INT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  employee_id INT,
  employee_name TEXT,
  day DATE,
  cnt BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id AS employee_id,
    e.name AS employee_name,
    date_trunc('day', sm.send_at)::date AS day,
    count(*) AS cnt
  FROM "sent-mail" sm
  JOIN customers c ON c.id = sm.customer_id
  JOIN employees e ON e.id = sm.employee_id
  WHERE c.client_id = p_client_id
    AND sm.send_at >= p_from
    AND sm.send_at <= p_to
    AND sm.employee_id IS NOT NULL
  GROUP BY e.id, e.name, date_trunc('day', sm.send_at)::date
  ORDER BY day, e.id;
$$;

-- Status distribution stats: returns counts grouped by status and day
CREATE OR REPLACE FUNCTION get_status_stats(
  p_client_id INT,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  status TEXT,
  cnt BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    date_trunc('day', send_at)::date AS day,
    COALESCE(status, 'new') AS status,
    count(*) AS cnt
  FROM "incoming-mails"
  WHERE client_id = p_client_id
    AND send_at >= p_from
    AND send_at <= p_to
  GROUP BY 1, 2
  ORDER BY day, status;
$$;
