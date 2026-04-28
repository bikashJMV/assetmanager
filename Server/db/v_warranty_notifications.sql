CREATE OR REPLACE VIEW v_warranty_notifications AS
SELECT
    gen_random_uuid()::text          AS notification_id,
    a.id::text                       AS asset_id,
    a.asset_tag,
    a.model,
    c.name                           AS category_name,
    aa.employee_id::text             AS current_employee_id,
    e.name                           AS current_employee_name,
    a.warranty_expiry::text          AS warranty_expiry,
    (a.warranty_expiry - CURRENT_DATE)::int AS days_remaining,
    CASE
        WHEN a.warranty_expiry < CURRENT_DATE        THEN 'expired'
        WHEN a.warranty_expiry <= CURRENT_DATE + 30  THEN 'due_soon'
    END                              AS severity,
    CASE
        WHEN a.warranty_expiry < CURRENT_DATE
            THEN 'Warranty expired on ' || a.warranty_expiry::text
        ELSE 'Warranty expires in ' || (a.warranty_expiry - CURRENT_DATE)::text || ' days'
    END                              AS message
FROM assets a
JOIN asset_categories c ON a.category_id = c.id
LEFT JOIN asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
LEFT JOIN employees e ON e.id = aa.employee_id
WHERE
    a.warranty_expiry IS NOT NULL
    AND coalesce(a.is_deleted, false) = false; 
-- Note: Filtering by days_remaining is handled by the API router to allow dynamic windows.
