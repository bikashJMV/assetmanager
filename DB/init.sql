--
-- PostgreSQL database dump
--


-- Dumped from database version 15.17
-- Dumped by pg_dump version 15.17

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: admin_audit_action; Type: TYPE; Schema: public; Owner: assetmanager_user
--

CREATE TYPE public.admin_audit_action AS ENUM (
    'created',
    'updated',
    'deleted',
    'restored',
    'bulk_imported'
);


ALTER TYPE public.admin_audit_action OWNER TO assetmanager_user;

--
-- Name: asset_event_type; Type: TYPE; Schema: public; Owner: assetmanager_user
--

CREATE TYPE public.asset_event_type AS ENUM (
    'asset_created',
    'asset_updated',
    'asset_assigned',
    'asset_returned',
    'asset_deleted',
    'asset_restored',
    'qr_scanned',
    'lifecycle_changed',
    'bulk_imported',
    'qr_batch_generated',
    'qr_reservation_consumed'
);


ALTER TYPE public.asset_event_type OWNER TO assetmanager_user;

--
-- Name: asset_status; Type: TYPE; Schema: public; Owner: assetmanager_user
--

CREATE TYPE public.asset_status AS ENUM (
    'in_stock',
    'assigned',
    'in_repair',
    'retired',
    'lost',
    'disposed'
);


ALTER TYPE public.asset_status OWNER TO assetmanager_user;

--
-- Name: custom_field_data_type; Type: TYPE; Schema: public; Owner: assetmanager_user
--

CREATE TYPE public.custom_field_data_type AS ENUM (
    'text',
    'number',
    'date',
    'boolean',
    'select'
);


ALTER TYPE public.custom_field_data_type OWNER TO assetmanager_user;

--
-- Name: role_audit_action; Type: TYPE; Schema: public; Owner: assetmanager_user
--

CREATE TYPE public.role_audit_action AS ENUM (
    'promoted',
    'demoted'
);


ALTER TYPE public.role_audit_action OWNER TO assetmanager_user;

--
-- Name: fn_next_asset_tag(); Type: FUNCTION; Schema: public; Owner: assetmanager_user
--

CREATE FUNCTION public.fn_next_asset_tag() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
  last_tag text;
  part text;
  n bigint;
BEGIN
  SELECT a.asset_tag INTO last_tag
  FROM public.assets a
  WHERE a.asset_tag ~ '^AST-[0-9]+$'
  ORDER BY a.asset_tag DESC
  LIMIT 1;

  IF last_tag IS NULL THEN
    RETURN 'AST-00001';
  END IF;

  part := split_part(last_tag, '-', 2);
  IF part = '' OR part !~ '^[0-9]+$' THEN
    RETURN 'AST-00001';
  END IF;

  n := part::bigint + 1;
  RETURN 'AST-' || lpad(n::text, 5, '0');
END;
$_$;


ALTER FUNCTION public.fn_next_asset_tag() OWNER TO assetmanager_user;

--
-- Name: FUNCTION fn_next_asset_tag(); Type: COMMENT; Schema: public; Owner: assetmanager_user
--

COMMENT ON FUNCTION public.fn_next_asset_tag() IS 'Next AST-##### tag; same rules as App AssetRepository.get_next_asset_tag (non-deleted rows, ^AST-[0-9]+$).';


--
-- Name: fn_set_updated_at(); Type: FUNCTION; Schema: public; Owner: assetmanager_user
--

CREATE FUNCTION public.fn_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_set_updated_at() OWNER TO assetmanager_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    target_user_id uuid,
    action public.admin_audit_action,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_audit_log OWNER TO assetmanager_user;

--
-- Name: asset_assignments; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.asset_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now(),
    returned_at timestamp with time zone,
    source text DEFAULT 'runtime'::text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT asset_assignments_source_check CHECK ((source = ANY (ARRAY['import'::text, 'runtime'::text, 'bulk'::text]))),
    CONSTRAINT ck_assignment_dates CHECK (((returned_at IS NULL) OR (returned_at >= assigned_at)))
);


ALTER TABLE public.asset_assignments OWNER TO assetmanager_user;

--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.asset_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.asset_categories OWNER TO assetmanager_user;

--
-- Name: asset_components; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.asset_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    component_type text NOT NULL,
    manufacturer_id uuid,
    model text,
    serial_number text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.asset_components OWNER TO assetmanager_user;

--
-- Name: asset_events; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.asset_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    event_type public.asset_event_type NOT NULL,
    actor_id text,
    payload jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.asset_events OWNER TO assetmanager_user;

--
-- Name: asset_logs; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.asset_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    actor_employee_id uuid,
    note text,
    qr_code text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.asset_logs OWNER TO assetmanager_user;

--
-- Name: asset_tag_seq; Type: SEQUENCE; Schema: public; Owner: assetmanager_user
--

CREATE SEQUENCE public.asset_tag_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.asset_tag_seq OWNER TO assetmanager_user;

--
-- Name: assets; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_tag text NOT NULL,
    category_id uuid NOT NULL,
    manufacturer_id uuid,
    model text,
    serial_number text NOT NULL,
    location_id uuid,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    status public.asset_status DEFAULT 'in_stock'::public.asset_status,
    purchase_date date,
    warranty_expiry date,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    deleted_by_employee_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    qr_code text,
    created_by_employee_id uuid,
    source text DEFAULT 'direct'::text NOT NULL,
    qr_reservation_id uuid
);


ALTER TABLE public.assets OWNER TO assetmanager_user;

--
-- Name: COLUMN assets.qr_code; Type: COMMENT; Schema: public; Owner: assetmanager_user
--

COMMENT ON COLUMN public.assets.qr_code IS 'Optional stored QR payload / reference; app may pass null on create.';


--
-- Name: COLUMN assets.created_by_employee_id; Type: COMMENT; Schema: public; Owner: assetmanager_user
--

COMMENT ON COLUMN public.assets.created_by_employee_id IS 'Employee who created the row; maps to employees.id.';


--
-- Name: custom_field_definitions; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.custom_field_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    field_key text NOT NULL,
    label text NOT NULL,
    data_type public.custom_field_data_type DEFAULT 'text'::public.custom_field_data_type,
    is_required boolean DEFAULT false,
    options jsonb,
    sort_order integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.custom_field_definitions OWNER TO assetmanager_user;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.departments OWNER TO assetmanager_user;

--
-- Name: employees; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id text NOT NULL,
    name text NOT NULL,
    email public.citext,
    department_id uuid,
    auth_user_id text,
    role text DEFAULT 'employee'::text,
    is_active boolean DEFAULT true,
    erp_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false NOT NULL,
    CONSTRAINT employees_role_check CHECK ((role = ANY (ARRAY['employee'::text, 'admin'::text, 'it_ops'::text])))
);


ALTER TABLE public.employees OWNER TO assetmanager_user;

--
-- Name: locations; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.locations OWNER TO assetmanager_user;

--
-- Name: manufacturers; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.manufacturers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    website text,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.manufacturers OWNER TO assetmanager_user;

--
-- Name: recycle_bin_entries; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.recycle_bin_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    label text NOT NULL,
    payload jsonb NOT NULL,
    deleted_at timestamp with time zone DEFAULT now(),
    deleted_by_employee_id uuid,
    restored_at timestamp with time zone,
    restored_by_employee_id uuid,
    CONSTRAINT recycle_bin_entries_entity_type_check CHECK ((entity_type = ANY (ARRAY['asset'::text, 'employee'::text])))
);


ALTER TABLE public.recycle_bin_entries OWNER TO assetmanager_user;

--
-- Name: employee_avatars; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.employee_avatars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    image_data bytea NOT NULL,
    mime_type text NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_avatars_size_chk CHECK (((byte_size > 0) AND (byte_size <= 51200))),
    CONSTRAINT employee_avatars_mime_chk CHECK ((mime_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text])))
);


ALTER TABLE public.employee_avatars OWNER TO assetmanager_user;

ALTER TABLE ONLY public.employee_avatars
    ADD CONSTRAINT employee_avatars_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_avatars
    ADD CONSTRAINT employee_avatars_employee_id_key UNIQUE (employee_id);

ALTER TABLE ONLY public.employee_avatars
    ADD CONSTRAINT employee_avatars_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

--
-- Name: role_audit_log; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.role_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_employee_id uuid,
    target_employee_id uuid,
    old_role text,
    new_role text,
    action public.role_audit_action,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.role_audit_log OWNER TO assetmanager_user;

--
-- Name: qr_batches; Type: TABLE; Schema: public; Owner: assetmanager_user
-- Reverse-engineered from Server/repositories/qr_repository.py and
-- Server/routers/api_v1_qr.py -- these tables were queried by the app but never
-- captured in the schema dump (BUG-1, 2026-07-18: "relation qr_batches does not exist").
--

CREATE TABLE public.qr_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    batch_code text NOT NULL,
    requested_count integer NOT NULL,
    start_tag text,
    end_tag text,
    status text DEFAULT 'generated'::text NOT NULL,
    created_by_employee_id uuid,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qr_batches_idempotency_key_key UNIQUE (idempotency_key)
);

ALTER TABLE public.qr_batches OWNER TO assetmanager_user;

ALTER TABLE ONLY public.qr_batches
    ADD CONSTRAINT qr_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.qr_batches
    ADD CONSTRAINT qr_batches_created_by_employee_id_fkey FOREIGN KEY (created_by_employee_id) REFERENCES public.employees(id);

CREATE INDEX idx_qr_batches_created_at ON public.qr_batches USING btree (created_at DESC);

--
-- Name: qr_tag_reservations; Type: TABLE; Schema: public; Owner: assetmanager_user
--

CREATE TABLE public.qr_tag_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    asset_tag text NOT NULL,
    status text DEFAULT 'reserved'::text NOT NULL,
    consumed_at timestamp with time zone,
    consumed_by_asset_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qr_tag_reservations_status_check CHECK ((status = ANY (ARRAY['reserved'::text, 'consumed'::text])))
);

ALTER TABLE public.qr_tag_reservations OWNER TO assetmanager_user;

ALTER TABLE ONLY public.qr_tag_reservations
    ADD CONSTRAINT qr_tag_reservations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.qr_tag_reservations
    ADD CONSTRAINT qr_tag_reservations_asset_tag_key UNIQUE (asset_tag);

ALTER TABLE ONLY public.qr_tag_reservations
    ADD CONSTRAINT qr_tag_reservations_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.qr_batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.qr_tag_reservations
    ADD CONSTRAINT qr_tag_reservations_consumed_by_asset_id_fkey FOREIGN KEY (consumed_by_asset_id) REFERENCES public.assets(id);

CREATE INDEX idx_qr_tag_reservations_batch_id ON public.qr_tag_reservations USING btree (batch_id);

CREATE INDEX idx_qr_reservations_unused ON public.qr_tag_reservations USING btree (created_at) WHERE (status = 'reserved'::text);

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_qr_reservation_id_fkey FOREIGN KEY (qr_reservation_id) REFERENCES public.qr_tag_reservations(id);

--
-- Name: v_asset_inventory; Type: VIEW; Schema: public; Owner: assetmanager_user
--

CREATE VIEW public.v_asset_inventory AS
 SELECT a.id,
    a.asset_tag,
    a.serial_number,
    a.model,
    a.status,
    a.purchase_date,
    a.warranty_expiry,
    a.custom_fields,
    a.metadata,
    a.is_deleted,
    a.created_at,
    a.updated_at,
    a.created_by,
    a.updated_by,
    c.id AS category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    m.id AS manufacturer_id,
    m.name AS manufacturer_name,
    l.id AS location_id,
    l.code AS location_code,
    l.name AS location_name,
    aa.id AS assignment_id,
    aa.assigned_at,
    e.id AS current_employee_id,
    e.employee_id AS current_employee_business_id,
    e.name AS current_employee_name,
    e.email AS current_employee_email,
    e.is_active AS current_employee_is_active,
    e.erp_active AS current_employee_erp_active,
    d.name AS current_employee_department
   FROM ((((((public.assets a
     LEFT JOIN public.asset_categories c ON ((a.category_id = c.id)))
     LEFT JOIN public.manufacturers m ON ((a.manufacturer_id = m.id)))
     LEFT JOIN public.locations l ON ((a.location_id = l.id)))
     LEFT JOIN public.asset_assignments aa ON (((a.id = aa.asset_id) AND (aa.returned_at IS NULL))))
     LEFT JOIN public.employees e ON ((aa.employee_id = e.id)))
     LEFT JOIN public.departments d ON ((e.department_id = d.id)))
  WHERE (a.is_deleted = false);


ALTER TABLE public.v_asset_inventory OWNER TO assetmanager_user;

--
-- Name: v_employee_directory; Type: VIEW; Schema: public; Owner: assetmanager_user
--

CREATE VIEW public.v_employee_directory AS
 SELECT e.id,
    e.employee_id AS employee_code,
    e.name,
    e.email,
    e.is_active,
    e.erp_active,
    e.role,
    e.auth_user_id,
    d.name AS department
   FROM (public.employees e
     LEFT JOIN public.departments d ON ((e.department_id = d.id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.recycle_bin_entries rbe
          WHERE ((rbe.entity_type = 'employee'::text) AND (rbe.entity_id = e.id) AND (rbe.restored_at IS NULL)))));


ALTER TABLE public.v_employee_directory OWNER TO assetmanager_user;

--
-- Name: v_recycle_bin; Type: VIEW; Schema: public; Owner: assetmanager_user
--

CREATE VIEW public.v_recycle_bin AS
 SELECT recycle_bin_entries.id,
    recycle_bin_entries.entity_type,
    recycle_bin_entries.entity_id,
    recycle_bin_entries.label,
    recycle_bin_entries.payload,
    recycle_bin_entries.deleted_at,
    recycle_bin_entries.deleted_by_employee_id,
    recycle_bin_entries.restored_at,
    recycle_bin_entries.restored_by_employee_id,
    recycle_bin_entries.deleted_at AS archived_at,
    del.employee_id AS archived_by_employee_id,
    del.name AS archived_by_name,
    split_part(del.name, ' '::text, 1) AS archived_by_first_name,
    res.employee_id AS restored_by_business_id,
    res.name AS restored_by_name
   FROM ((public.recycle_bin_entries
     LEFT JOIN public.employees del ON ((del.id = recycle_bin_entries.deleted_by_employee_id)))
     LEFT JOIN public.employees res ON ((res.id = recycle_bin_entries.restored_by_employee_id)));


ALTER TABLE public.v_recycle_bin OWNER TO assetmanager_user;

--
-- Name: v_warranty_notifications; Type: VIEW; Schema: public; Owner: assetmanager_user
--

CREATE VIEW public.v_warranty_notifications AS
 SELECT (gen_random_uuid())::text AS notification_id,
    (a.id)::text AS asset_id,
    a.asset_tag,
    a.model,
    c.name AS category_name,
    (aa.employee_id)::text AS current_employee_id,
    e.name AS current_employee_name,
    (a.warranty_expiry)::text AS warranty_expiry,
    (a.warranty_expiry - CURRENT_DATE) AS days_remaining,
        CASE
            WHEN (a.warranty_expiry < CURRENT_DATE) THEN 'expired'::text
            WHEN (a.warranty_expiry <= (CURRENT_DATE + 30)) THEN 'due_soon'::text
            ELSE NULL::text
        END AS severity,
        CASE
            WHEN (a.warranty_expiry < CURRENT_DATE) THEN ('Warranty expired on '::text || (a.warranty_expiry)::text)
            ELSE (('Warranty expires in '::text || ((a.warranty_expiry - CURRENT_DATE))::text) || ' days'::text)
        END AS message
   FROM (((public.assets a
     JOIN public.asset_categories c ON ((a.category_id = c.id)))
     LEFT JOIN public.asset_assignments aa ON (((aa.asset_id = a.id) AND (aa.returned_at IS NULL))))
     LEFT JOIN public.employees e ON ((e.id = aa.employee_id)))
  WHERE ((a.warranty_expiry IS NOT NULL) AND (COALESCE(a.is_deleted, false) = false));


ALTER TABLE public.v_warranty_notifications OWNER TO assetmanager_user;

--
-- Data for Name: admin_audit_log; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.admin_audit_log (id, admin_id, target_user_id, action, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: asset_assignments; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.asset_assignments (id, asset_id, employee_id, assigned_at, returned_at, source, notes, metadata, created_at, updated_at) FROM stdin;
2072869d-29c1-4f89-aad4-96b993953c8e	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-27 16:54:59.404769+00	2026-04-27 16:56:19.381865+00	runtime	\N	{}	2026-04-27 16:54:59.549635+00	2026-04-27 16:56:18.530241+00
c34ef0ec-a31d-4f6f-9081-0497235e83c2	35a329a9-cbb1-4a33-b539-a5612c18fbe5	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-27 17:52:18.716331+00	2026-04-27 17:52:48.208407+00	runtime	Auto-closed by reassignment	{}	2026-04-27 17:52:19.422192+00	2026-04-27 17:52:49.050726+00
69794046-9abb-4035-92c5-f663f5c5eba0	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-27 18:54:23.815067+00	2026-04-27 18:55:19.198194+00	runtime	\N	{}	2026-04-27 18:54:23.625633+00	2026-04-27 18:55:19.628478+00
95b81f3d-0ede-4565-9a7b-66a726999eac	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-27 18:55:42.657242+00	2026-04-27 18:56:03.190906+00	runtime	Auto-closed by reassignment	{}	2026-04-27 18:55:43.594382+00	2026-04-27 18:56:02.841988+00
2f97e48c-06cb-419d-b91a-c1423ecbbfc4	35a329a9-cbb1-4a33-b539-a5612c18fbe5	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 17:52:48.208407+00	2026-04-27 19:32:54.968416+00	runtime	\N	{}	2026-04-27 17:52:49.050726+00	2026-04-27 19:32:54.344369+00
16a197f7-2f44-4178-b9ce-5487912a13c9	35a329a9-cbb1-4a33-b539-a5612c18fbe5	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 19:33:09.238652+00	\N	runtime	\N	{}	2026-04-27 19:33:09.813931+00	2026-04-27 19:33:09.813931+00
ab596b3d-c9e3-48a5-be08-c905f821fa9d	1368ac5e-36f2-4fec-97d2-9523d39191ca	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-27 18:54:05.593413+00	2026-04-27 19:33:22.126174+00	runtime	\N	{}	2026-04-27 18:54:06.57671+00	2026-04-27 19:33:21.804257+00
16b5e079-b6c9-49b3-a0dd-d6fb726be56b	1368ac5e-36f2-4fec-97d2-9523d39191ca	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-27 19:33:27.786936+00	\N	runtime	\N	{}	2026-04-27 19:33:27.120613+00	2026-04-27 19:33:27.120613+00
26d07ef5-5d98-4100-aac2-40e07782388f	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 18:56:03.190906+00	2026-04-27 19:33:50.569224+00	runtime	\N	{}	2026-04-27 18:56:02.841988+00	2026-04-27 19:33:50.539988+00
3fd5fe0b-606d-4b95-89a2-d70d9865f4d0	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 19:33:56.511425+00	\N	runtime	\N	{}	2026-04-27 19:33:56.086972+00	2026-04-27 19:33:56.086972+00
56e8350b-5eb6-469f-a08e-d4ca2761b710	229cb8a0-bede-408e-bd5f-25b3451a2b02	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 21:45:02.097646+00	2026-04-27 21:45:44.261432+00	runtime	Auto-closed by reassignment	{}	2026-04-27 21:45:01.997501+00	2026-04-27 21:45:43.58445+00
e107356e-3403-41d2-b244-e887aef9b364	229cb8a0-bede-408e-bd5f-25b3451a2b02	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-27 21:45:44.261432+00	2026-04-27 22:01:54.815135+00	runtime	\N	{}	2026-04-27 21:45:43.58445+00	2026-04-27 22:01:56.033549+00
81dc5883-302c-4b68-b4ba-7b036342b948	229cb8a0-bede-408e-bd5f-25b3451a2b02	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 22:03:20.613565+00	2026-04-27 22:07:36.210434+00	runtime	\N	{}	2026-04-27 22:03:20.387441+00	2026-04-27 22:07:36.060942+00
f46c4419-7ade-4a6d-b6a5-0b7935815ed4	229cb8a0-bede-408e-bd5f-25b3451a2b02	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-28 06:42:48.53989+00	2026-04-28 07:15:19.65549+00	runtime	\N	{}	2026-04-28 06:42:49.85816+00	2026-04-28 07:15:21.158325+00
475386ec-b07c-4384-87fe-c534533c25b2	08b27404-425e-4535-a80b-37242577ce98	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-27 21:06:53.41853+00	2026-04-28 07:16:43.086919+00	runtime	Auto-closed by reassignment	{}	2026-04-27 21:06:53.522203+00	2026-04-28 07:16:43.008134+00
10d4f80a-145c-4477-a695-1be9de6d61fe	08b27404-425e-4535-a80b-37242577ce98	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-28 07:16:43.086919+00	\N	runtime	\N	{}	2026-04-28 07:16:43.008134+00	2026-04-28 07:16:43.008134+00
dd204021-c5fc-42d7-a5dc-980ed7f69f28	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-27 21:06:53.309836+00	2026-04-28 18:54:23.086853+00	runtime	\N	{}	2026-04-27 21:06:53.420142+00	2026-04-28 18:54:23.062864+00
fb496e2e-febc-4053-8328-7c605d2a0e77	275590b7-be5b-40c6-b4a0-c84f594d6445	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-28 18:56:09.785811+00	2026-04-28 18:56:41.676432+00	runtime	Auto-closed by reassignment	{}	2026-04-28 18:56:09.811691+00	2026-04-28 18:56:41.710653+00
e7445396-2ae8-4792-888f-18a384d589bf	275590b7-be5b-40c6-b4a0-c84f594d6445	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-28 18:56:41.676432+00	2026-04-28 18:57:30.985571+00	runtime	\N	{}	2026-04-28 18:56:41.710653+00	2026-04-28 18:57:30.925244+00
38799292-b3be-4753-81f1-f4261b5b64d6	f24f2b61-a523-47c9-8460-ea95b8715c25	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-29 20:02:03.900956+00	2026-04-29 20:02:35.173453+00	runtime	Auto-closed by reassignment	{}	2026-04-29 20:02:03.901542+00	2026-04-29 20:02:35.174025+00
4f2aa392-d032-4070-87d8-1f347def0a09	f24f2b61-a523-47c9-8460-ea95b8715c25	d7595e68-506d-48f0-b2ab-e1d4d5e9f764	2026-04-29 20:02:35.173453+00	\N	runtime	\N	{}	2026-04-29 20:02:35.174025+00	2026-04-29 20:02:35.174025+00
\.


--
-- Data for Name: asset_categories; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.asset_categories (id, slug, name, description, is_active, metadata, created_at, updated_at) FROM stdin;
e2d0052a-3ea6-4454-8b34-e7f29a1577da	laptop	Laptop	Portable computers	t	{}	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
9016120c-a281-46ff-8e49-81f059ed164b	desktop	Desktop	Desktop computers	t	{}	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
1370dc4a-ae4f-4aa4-ab0d-d16f5cbeae0b	monitor	Monitor	Display screens	t	{}	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
2289eb20-44c5-4c3d-9e78-64872d8395ae	printer	Printer	Printers and scanners	t	{}	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	pen-drive	Pen Drive	USB flash drives	t	{}	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
1c4ffece-c231-491d-bb12-48d6952fcc6f	other	Other	Miscellaneous assets	t	{}	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
8815099e-5883-4bd7-82e1-7f8a56673c1c	mouse	Mouse	\N	t	{}	2026-04-27 10:06:45.560714+00	2026-04-27 10:06:45.560714+00
60b7adf3-53cc-4aa9-9418-c6ddf6e860bc	keyboard	Keyboard	\N	t	{}	2026-04-27 10:06:45.620945+00	2026-04-27 10:06:45.620945+00
41a24405-1881-4029-ab6e-ec471537e67f	mobile	Mobile	\N	t	{}	2026-04-27 14:43:32.161187+00	2026-04-27 14:43:32.161187+00
cae20a82-bbb1-45d5-b91c-90b9e23c458a	locker	Locker	\N	t	{}	2026-04-28 17:39:06.436661+00	2026-04-28 17:39:06.436661+00
\.


--
-- Data for Name: asset_components; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.asset_components (id, asset_id, component_type, manufacturer_id, model, serial_number, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: asset_events; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.asset_events (id, asset_id, event_type, actor_id, payload, ip_address, user_agent, created_at) FROM stdin;
df36d60c-b59a-4d15-8ef2-348a86840f8c	45169de5-ee4e-453f-8892-9f6180409843	asset_created	369217581027950595	{"asset_tag": "AST-00005", "category_id": "41a24405-1881-4029-ab6e-ec471537e67f", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 16:10:55.976626+00
a4fcf932-a03c-4088-b359-e2cea4f6f3fd	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	asset_assigned	369217581027950595	{"asset_tag": "AST-00003", "employee_id": "JMV10728", "assignment_id": "2072869d-29c1-4f89-aad4-96b993953c8e", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 16:54:59.549635+00
bf397940-9a86-4b60-b099-7873288618af	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	asset_returned	369217581027950595	{"asset_id": "02c4d6c0-8aa5-4c18-b676-a2f40dacab2d", "asset_tag": "AST-00003", "assignment_id": "2072869d-29c1-4f89-aad4-96b993953c8e", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "previous_employee_id": "JMV10728", "previous_employee_name": "Bikash Prasad Barnwal"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 16:56:18.530241+00
8acd2b47-88cf-4141-8f8d-a047be22b3f7	03729af2-c17f-4e3a-893f-52a6e5b45a5a	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:05:30.628676+00
5a341cfb-b12f-486f-96ef-548fa4a16f6d	03729af2-c17f-4e3a-893f-52a6e5b45a5a	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:05:59.944564+00
e69e8ba3-1608-4c3e-bcd9-4ce68296e309	65d74d1a-16d6-4348-b6b5-cdbf0607f092	asset_created	369217581027950595	{"asset_tag": "AST-00006", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:24:39.555408+00
d114e43d-0679-4dac-ac83-5516095b022b	65d74d1a-16d6-4348-b6b5-cdbf0607f092	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "changes": {"location_id": {"new": "4da76a93-03eb-493e-aa76-1038a694cc45", "old": null}, "custom_fields": {"new": {"Wifi": "0.0.0.0"}, "old": {}}}, "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:25:01.2119+00
8a2f9f2c-e198-4bcc-986e-267918103dc1	65d74d1a-16d6-4348-b6b5-cdbf0607f092	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "changes": [{"after": "0c6951c5-b0f8-42a8-bf6c-7eb559d33a0f", "field": "location_id", "label": "Location Id", "before": "4da76a93-03eb-493e-aa76-1038a694cc45"}, {"after": {"Wifi": "0.0.0.0", "wifi": "18.292.393.94"}, "field": "custom_fields", "label": "Custom Fields", "before": {"Wifi": "0.0.0.0"}}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:30:23.432019+00
73af714a-face-411b-92dd-cabc87eb2234	65d74d1a-16d6-4348-b6b5-cdbf0607f092	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "changes": [{"after": {"Wifi": "0.0.0.0", "wifi": "18.292.393.90"}, "field": "custom_fields", "label": "Custom Fields", "before": {"Wifi": "0.0.0.0", "wifi": "18.292.393.94"}}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:36:52.880909+00
935bfe58-1f0b-4631-a087-6c0902ad0d2d	65d74d1a-16d6-4348-b6b5-cdbf0607f092	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "changes": [{"after": "JMV_LPS_LTD_(UNIT-J1", "field": "location_code", "label": "Location Code", "before": "W-50"}, {"after": "JMV LPS LTD (Unit-J12), J-12, Site-C, Surajpur Industrial Area, Greater Noida, Uttar Pradesh, 201306", "field": "location_name", "label": "Location Name", "before": "W-50"}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:38:17.789475+00
45201fc5-6f22-4d13-ba95-b97ec6bb291e	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "changes": [], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:38:51.394489+00
01ff2819-bd46-440f-9035-c72882c174b5	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	asset_updated	369217581027950595	{"op": "asset.update_status", "source": "asset_edit", "changes": [{"after": "retired", "field": "status", "label": "Status", "before": "in_stock"}], "new_status": "retired", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:38:51.417046+00
dd43b02c-ac78-466a-9c54-ebbfc8113bdb	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"], "changes": [{"after": {"wifi": "0.0.0.0"}, "field": "custom_fields", "label": "Custom Fields", "before": {}}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:39:12.197926+00
2084f5e8-c2d9-4549-8064-fadefcbd9ec2	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	asset_updated	369217581027950595	{"op": "asset.update_status", "source": "asset_edit", "changes": [{"after": "in_stock", "field": "status", "label": "Status", "before": "retired"}], "new_status": "in_stock", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:39:12.215059+00
4896ae1d-f9c7-436c-9287-77d6296a1feb	8226c4da-3deb-4504-8617-5f0338a26cf5	bulk_imported	369217581027950595	{"asset_tag": "AST-00007", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.380378+00
29150ed9-c824-45fc-afb0-e3207a68ba9a	b2fc015b-7de0-420a-b457-81f753a7ed42	bulk_imported	369217581027950595	{"asset_tag": "AST-00008", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.389795+00
b6d1ea95-439f-4265-b2c0-e6adfb084419	5833dcdf-ae66-4927-ab7f-4cce4127aba9	bulk_imported	369217581027950595	{"asset_tag": "AST-00009", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.406203+00
570d3dfb-589f-4114-8d66-28a0cd0f75a8	dcffc33a-315e-4add-b7c2-1fc9f1db6d15	bulk_imported	369217581027950595	{"asset_tag": "AST-00010", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.417623+00
b8708a22-509b-47e5-bd1f-cc2bc3ca973b	15021812-cb39-4c4b-a655-cb017eaed378	bulk_imported	369217581027950595	{"asset_tag": "AST-00011", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.427627+00
02edd255-594c-4956-82d1-77902583ee22	77aa569c-4e31-4632-9487-c5ef03726679	bulk_imported	369217581027950595	{"asset_tag": "AST-00012", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.438101+00
77a9b074-ddec-468b-9291-2698288da8de	e3c8c011-e10c-4676-a2d0-c09c1d26233c	bulk_imported	369217581027950595	{"asset_tag": "AST-00013", "category_id": "60b7adf3-53cc-4aa9-9418-c6ddf6e860bc", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.446686+00
e0860b64-25e3-4505-88d8-6f699e6bf3dd	e101e906-e143-42dd-a3ef-4cc3bc094abb	bulk_imported	369217581027950595	{"asset_tag": "AST-00014", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.454334+00
bc6b2a80-881b-4196-94ea-28c8ae876ea0	40e641b5-ab8c-4265-906a-4b45f9302dc8	bulk_imported	369217581027950595	{"asset_tag": "AST-00015", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.462217+00
fcf2608a-d04d-497c-a866-6764be0d8774	d4dcf8f5-ab64-4301-86b6-e23df08cc0d0	bulk_imported	369217581027950595	{"asset_tag": "AST-00016", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.474992+00
5a527bd4-b83d-47d5-8adb-20b2f693d3fe	05bde49c-8e1f-46c1-9517-0c0f6665ebd5	bulk_imported	369217581027950595	{"asset_tag": "AST-00017", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.486491+00
36a0145d-dd59-49d2-8591-b70ae10ede24	21133702-dca1-46e8-b772-7e3244418dc2	bulk_imported	369217581027950595	{"asset_tag": "AST-00018", "category_id": "fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.495255+00
60803915-1bdf-4f77-bd04-4cfa872bc41d	857590e4-9b65-4508-9225-345531a780e1	bulk_imported	369217581027950595	{"asset_tag": "AST-00019", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.504667+00
a1718d33-2129-4f71-a84d-5eb6b6879d50	51e9d0bb-3dda-46ed-8836-86fd30d50f6d	bulk_imported	369217581027950595	{"asset_tag": "AST-00020", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.513616+00
a6ad089a-53b5-4a91-9c6c-47e4695299a7	a82f8c5e-1593-4acf-bd23-060bf15c2f19	bulk_imported	369217581027950595	{"asset_tag": "AST-00021", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.523588+00
ed5eb58e-b594-4f0d-9516-b0badfcc0f03	4590b456-c65e-4934-b1b8-6376021ce0da	bulk_imported	369217581027950595	{"asset_tag": "AST-00022", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.534144+00
ba9ef355-ea34-492f-a0b2-a6b2721b8dfd	83b36b6c-a81f-45ba-87ae-611bfb24f9cb	bulk_imported	369217581027950595	{"asset_tag": "AST-00023", "category_id": "60b7adf3-53cc-4aa9-9418-c6ddf6e860bc", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.541279+00
ef1e5d97-553d-4f19-868b-763fc58eb2cb	ff5b51da-b2d1-4a97-8a07-b1b4b25deb80	bulk_imported	369217581027950595	{"asset_tag": "AST-00024", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.550597+00
b0d9f4c6-a302-4e3c-944e-818db1fa0f1a	921f5107-abe7-467c-ad87-42f477152a8e	bulk_imported	369217581027950595	{"asset_tag": "AST-00025", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.559124+00
bb7f5e33-58a8-47ee-810c-7ab387c73a33	3cd515c8-ee0d-4573-a0d0-f5a9fd6bd4ca	bulk_imported	369217581027950595	{"asset_tag": "AST-00026", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.568052+00
b4d8b221-30c3-48cf-a7cb-1819706509fb	bd6579ab-2427-4d32-a222-c2a3fca1124d	bulk_imported	369217581027950595	{"asset_tag": "AST-00027", "category_id": "60b7adf3-53cc-4aa9-9418-c6ddf6e860bc", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.574837+00
6ca467cc-2a2f-41c6-96c9-62cf9953dec1	fd33d904-5643-480e-b1c9-c63b29be2d5d	bulk_imported	369217581027950595	{"asset_tag": "AST-00028", "category_id": "fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.582957+00
cfc51015-8c9a-4d2c-a5ac-0bdd0eede69b	0df3b1a8-59f0-451a-bc5a-c031ec630880	bulk_imported	369217581027950595	{"asset_tag": "AST-00029", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.59285+00
ced04047-086a-4df1-b3e9-1f0c5ce7538c	a7097b04-5b39-4ce4-b574-da5eca58fb6f	bulk_imported	369217581027950595	{"asset_tag": "AST-00030", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.60265+00
9209e7db-15b1-4a21-9da3-e9410ee118b2	5790de0e-0a40-411a-b481-038579bd0ac7	bulk_imported	369217581027950595	{"asset_tag": "AST-00031", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.610522+00
896b5a83-91f3-4a7e-9a24-96470aff1c3d	c443c0b4-9091-4178-9c9f-b9cb5372c0f5	bulk_imported	369217581027950595	{"asset_tag": "AST-00032", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.619064+00
6a52c57e-82e9-4be7-ab8e-30a52a5dd31b	1152694a-4469-45a7-b47c-86c4efb8be2d	bulk_imported	369217581027950595	{"asset_tag": "AST-00033", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.627836+00
52c97f99-c155-4969-a5fd-a3b27b172df4	0ff3d012-0468-4957-9b30-2bd84f5272bf	bulk_imported	369217581027950595	{"asset_tag": "AST-00034", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.634558+00
d66575f6-60d3-449c-9ded-afbbebf2515d	a3159dfa-66ee-440d-a222-bfa4e1231cfb	bulk_imported	369217581027950595	{"asset_tag": "AST-00035", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.641564+00
06a673b2-417d-472e-b71d-359c239372cc	b81838d6-c874-4767-990f-50ac73ef498b	bulk_imported	369217581027950595	{"asset_tag": "AST-00036", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.648059+00
639115b1-90ed-4fb4-abe9-74d8f7891b8f	dab12aa5-61a0-463d-9044-d40de34564ec	bulk_imported	369217581027950595	{"asset_tag": "AST-00037", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.653495+00
a1fe894d-8c9a-4785-8edc-7f4a328d2118	ffa3d944-619f-437c-88c0-4e0a3f0c397b	bulk_imported	369217581027950595	{"asset_tag": "AST-00038", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.66213+00
04c26c09-9310-46ca-bfdb-bf17112bbd40	ae34fa01-97ae-4a57-a17a-5bc48b6a3610	bulk_imported	369217581027950595	{"asset_tag": "AST-00039", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.667703+00
ddccfb4c-0dbf-464e-b399-f1c168dc8ef5	e49a4201-b7c4-435c-9c61-3ad3b8cdbc29	bulk_imported	369217581027950595	{"asset_tag": "AST-00040", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.676353+00
71db6984-b46f-4946-a6a7-7779f1ffc0b3	03cf7d40-3dcf-4f86-8566-2070219ac5d4	bulk_imported	369217581027950595	{"asset_tag": "AST-00041", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.682539+00
3acffbbd-7f92-4a3e-98f4-fb84bc9a801f	a7fdd538-556f-48bb-9851-352dc3f3dc88	bulk_imported	369217581027950595	{"asset_tag": "AST-00042", "category_id": "60b7adf3-53cc-4aa9-9418-c6ddf6e860bc", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.691283+00
31558788-f190-422f-acff-8c963a6dc03b	63cc972c-8cbc-4606-89fb-008313abf5ee	bulk_imported	369217581027950595	{"asset_tag": "AST-00043", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.698746+00
48311a0c-2031-430d-b0e5-f688d064c84d	51551950-e506-4c07-8afc-224bb58107e4	bulk_imported	369217581027950595	{"asset_tag": "AST-00044", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.706736+00
4167df83-16dc-434d-90b8-6864923756ed	3ef3a699-afd0-4ce1-8235-c58e3a7836d4	bulk_imported	369217581027950595	{"asset_tag": "AST-00045", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.713671+00
9e03367f-5f82-4e9d-9424-59e3ae33a907	933ccedb-4540-49d6-96b0-3f7bedbbe9d8	bulk_imported	369217581027950595	{"asset_tag": "AST-00046", "category_id": "fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.720687+00
8c7434fc-e5fa-415a-8971-df033d5eb4ec	c90e4969-0b48-4653-9921-d06cfe26e2f6	bulk_imported	369217581027950595	{"asset_tag": "AST-00047", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.727508+00
91007220-667f-4a90-bd7b-63f44e947671	8ae52916-5d92-4900-89ff-19da32450d3a	bulk_imported	369217581027950595	{"asset_tag": "AST-00048", "category_id": "fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.734895+00
c069c6a8-970e-483c-ba0f-26cc1a42545e	0c49735f-429c-4f5d-95f7-f14b11c4cf84	bulk_imported	369217581027950595	{"asset_tag": "AST-00049", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.741422+00
e1cd1f97-8e11-4dd6-9d4c-7356afd1c316	6d489933-36ba-4ccc-b06c-221c62fd966c	bulk_imported	369217581027950595	{"asset_tag": "AST-00050", "category_id": "fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.749517+00
c51ed7bd-3476-4f0b-9392-2b25e1adec26	10d79a90-9ab5-4d8b-9c2d-22f43631a19a	bulk_imported	369217581027950595	{"asset_tag": "AST-00051", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.756402+00
e219e2af-bc24-4c6f-9877-388da528dd62	f1764a8d-9812-466b-a17b-c86e441b6247	bulk_imported	369217581027950595	{"asset_tag": "AST-00052", "category_id": "fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.762243+00
a35aaaaa-a1eb-4735-9846-1723641cfb4b	654e643d-542e-4b7e-b94a-f99b7c07438d	bulk_imported	369217581027950595	{"asset_tag": "AST-00053", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.77249+00
48e72e4c-5275-49a0-affb-dafaa4af738b	5d7bcd6f-7379-494e-b06a-b45a0ed2a4ff	bulk_imported	369217581027950595	{"asset_tag": "AST-00054", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.77943+00
64f9d18e-a402-4bb6-946e-69464a1973ca	f3e34b2d-2f29-4a6c-859e-b47a3bb7aa2d	bulk_imported	369217581027950595	{"asset_tag": "AST-00055", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.788438+00
b54ae8b7-9f39-47b5-bc05-e05ad7499458	6551849d-09bb-4a9d-98d8-055c731d70be	bulk_imported	369217581027950595	{"asset_tag": "AST-00056", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.794673+00
37916d08-244b-492a-8ca8-474cdd510092	509779b8-2bd0-4453-9360-3fd333fb598e	bulk_imported	369217581027950595	{"asset_tag": "AST-00057", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.80266+00
27aa6b84-538c-40dc-bd33-4656b2dd89fb	8f83997a-a6c3-4397-8ef3-cee870a58bc0	bulk_imported	369217581027950595	{"asset_tag": "AST-00058", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.809296+00
5bee7e41-dbc9-4ae3-a88d-e6acae404fba	f24f2b61-a523-47c9-8460-ea95b8715c25	bulk_imported	369217581027950595	{"asset_tag": "AST-00059", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.819231+00
6da9b828-bd70-4e82-855a-404719d4e099	4c260f2b-30cd-45e7-8dc6-9e55745d5e79	bulk_imported	369217581027950595	{"asset_tag": "AST-00060", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.825833+00
4f9b2381-9f25-42b9-b884-be3855e5e472	e9bfa722-2e74-46d2-8c90-cd116d32cc88	bulk_imported	369217581027950595	{"asset_tag": "AST-00061", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.835152+00
1564ec76-807b-4f10-892b-c26e104fd027	4fe9b66d-383b-47d9-b2fa-34f4859b957c	bulk_imported	369217581027950595	{"asset_tag": "AST-00062", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.844898+00
62b61601-4454-4f3f-a2eb-b14a76bb71b9	f3d72b26-f9a1-4672-800a-d02119ec62e9	bulk_imported	369217581027950595	{"asset_tag": "AST-00063", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.852659+00
fe0975b8-7747-450d-9982-c58536cbcfd5	614fd419-7916-4bb3-a81b-3c2368b697d7	bulk_imported	369217581027950595	{"asset_tag": "AST-00064", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.859866+00
53f081f1-9858-4c36-ae67-995844240f33	15e14696-ff31-4654-8d9a-d67f6e3181c3	bulk_imported	369217581027950595	{"asset_tag": "AST-00065", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.867609+00
431926a9-4346-477a-aa20-4b365294922d	826dc9e9-17b2-46fa-a97e-0bbc3ef5b4d2	bulk_imported	369217581027950595	{"asset_tag": "AST-00066", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.873458+00
320c8a9d-ef4b-4c9a-b3f3-08db318b228c	b7295a08-171e-4325-a5a8-447813703223	bulk_imported	369217581027950595	{"asset_tag": "AST-00067", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.882307+00
605fc8f4-3149-4ffd-838d-375d0c2b370d	7bc90958-b4ec-47a8-b2cd-43c8a45e1a5f	bulk_imported	369217581027950595	{"asset_tag": "AST-00068", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.888631+00
828bafc3-2f95-4dda-803b-a6df47420cf7	b250d0f5-0cd9-4e8b-9e02-6af7ca77ce7c	bulk_imported	369217581027950595	{"asset_tag": "AST-00069", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.896358+00
3a62d716-5472-4fff-8c19-789ae33aba32	0abb8b00-a9e4-4fd3-a3d4-8f56c48c0caf	bulk_imported	369217581027950595	{"asset_tag": "AST-00070", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.90271+00
26a04c75-e1c2-42ab-9416-5c70721bfd11	a6825968-96b6-410b-bfe9-513256291d49	bulk_imported	369217581027950595	{"asset_tag": "AST-00071", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.912465+00
22d1b41c-adcf-4b14-abc6-4d7314d1c793	a0f6a0e9-270c-4929-9747-f2b9829bda02	bulk_imported	369217581027950595	{"asset_tag": "AST-00072", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.91846+00
f19ed9b7-986a-4351-89da-567c36da2306	4a8f9463-4696-44e1-a501-c37e49ebeceb	bulk_imported	369217581027950595	{"asset_tag": "AST-00073", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.92609+00
68745173-ef50-4918-b662-a8a0ea8a833b	c35969f5-a49e-4681-931e-2cb29d56b0b7	bulk_imported	369217581027950595	{"asset_tag": "AST-00074", "category_id": "9016120c-a281-46ff-8e49-81f059ed164b", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.932503+00
a7d7a70e-b069-40f0-b031-8e9248cd53df	be384b0d-ce35-450b-972e-ec68875679f6	bulk_imported	369217581027950595	{"asset_tag": "AST-00075", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.941655+00
b0b2b0bb-fb5d-4d20-b838-8d5bc51c3da7	27a4dccd-a947-4408-ad51-a2436d362e38	bulk_imported	369217581027950595	{"asset_tag": "AST-00076", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.948958+00
3ccb85fd-3cfb-43f2-bdde-c178bd80c9ce	2de7b168-081d-4c45-a497-0e69b6852f7f	bulk_imported	369217581027950595	{"asset_tag": "AST-00077", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.95871+00
0e0eb85d-fe8a-43dd-9e0d-38e45123f76c	a9edce28-ab93-46c5-beb0-ed1f0c071728	bulk_imported	369217581027950595	{"asset_tag": "AST-00078", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.966354+00
e4e28bbb-bd69-476c-a01d-5a38c2a4e7c5	a3784996-4016-45f7-a2ab-661e0808b4ac	bulk_imported	369217581027950595	{"asset_tag": "AST-00079", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.976116+00
4c3a1ad9-39b4-4729-bf5d-7001768f12de	229cb8a0-bede-408e-bd5f-25b3451a2b02	bulk_imported	369217581027950595	{"asset_tag": "AST-00080", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.985918+00
3291bcff-0c84-41e7-ab55-008e2bd635af	08b27404-425e-4535-a80b-37242577ce98	bulk_imported	369217581027950595	{"asset_tag": "AST-00081", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:43.993698+00
958fe3fa-6249-4982-9d22-5e0ecde2af06	275590b7-be5b-40c6-b4a0-c84f594d6445	bulk_imported	369217581027950595	{"asset_tag": "AST-00082", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:44.001653+00
0addd69c-94f9-4363-b6c0-b991107530c0	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	bulk_imported	369217581027950595	{"asset_tag": "AST-00083", "category_id": "8815099e-5883-4bd7-82e1-7f8a56673c1c", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:44.009535+00
69f2af74-3dce-4177-9328-3ce8d57df683	1368ac5e-36f2-4fec-97d2-9523d39191ca	bulk_imported	369217581027950595	{"asset_tag": "AST-00084", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:44.018429+00
9df0bd3a-01e0-4d4f-94c0-17c16f5466ac	35a329a9-cbb1-4a33-b539-a5612c18fbe5	bulk_imported	369217581027950595	{"asset_tag": "AST-00085", "category_id": "e2d0052a-3ea6-4454-8b34-e7f29a1577da", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:41:44.02629+00
6de1dea1-cc0d-40a0-be0a-c6f240f7f229	35a329a9-cbb1-4a33-b539-a5612c18fbe5	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "metadata", "category_id", "manufacturer_id"], "changes": [{"after": null, "field": "metadata.category_mode", "label": "Metadata: Category_Mode", "before": "predefined"}, {"after": "Lorem", "field": "metadata.notes", "label": "Metadata: Notes", "before": null}, {"after": null, "field": "metadata.source", "label": "Metadata: Source", "before": "bulk_import"}, {"after": null, "field": "metadata.template_version", "label": "Metadata: Template_Version", "before": 5}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 17:49:56.74048+00
d1306bfa-907e-4c71-afe5-8925eb9dfc8d	35a329a9-cbb1-4a33-b539-a5612c18fbe5	asset_assigned	369217581027950595	{"asset_tag": "AST-00085", "employee_id": "JMV10728", "assignment_id": "c34ef0ec-a31d-4f6f-9081-0497235e83c2", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:52:19.422192+00
736458cd-c406-46c6-baa5-f79cc23c771a	35a329a9-cbb1-4a33-b539-a5612c18fbe5	asset_returned	369217581027950595	{"reason": "auto_closed_by_reassignment", "asset_tag": "AST-00085", "employee_id": "JMV10728", "assignment_id": "c34ef0ec-a31d-4f6f-9081-0497235e83c2", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:52:49.050726+00
abd44974-ac04-4116-9a0a-c650860809e2	35a329a9-cbb1-4a33-b539-a5612c18fbe5	asset_assigned	369217581027950595	{"asset_tag": "AST-00085", "employee_id": "EMP-001", "assignment_id": "2f97e48c-06cb-419d-b91a-c1423ecbbfc4", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": "JMV10728", "previous_employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 17:52:49.050726+00
64cc529f-01a3-4966-a7f8-29cac103efed	1368ac5e-36f2-4fec-97d2-9523d39191ca	asset_assigned	369217838071676931	{"asset_tag": "AST-00084", "employee_id": "JMV000000", "assignment_id": "ab596b3d-c9e3-48a5-be08-c905f821fa9d", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 18:54:06.57671+00
7b3341c3-f5f6-40f4-9d3d-5e0e4fdd7eac	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_assigned	369217838071676931	{"asset_tag": "AST-00083", "employee_id": "JMV000000", "assignment_id": "69794046-9abb-4035-92c5-f663f5c5eba0", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 18:54:23.625633+00
b59fb075-0361-45d7-bcf0-adb466f95a7d	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_returned	369217838071676931	{"asset_id": "1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18", "asset_tag": "AST-00083", "assignment_id": "69794046-9abb-4035-92c5-f663f5c5eba0", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "previous_employee_id": "JMV000000", "previous_employee_name": "Employee Asset"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 18:55:19.628478+00
479572a0-d055-4832-b613-ac12c4b19091	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_assigned	369217838071676931	{"asset_tag": "AST-00083", "employee_id": "JMV000000", "assignment_id": "95b81f3d-0ede-4565-9a7b-66a726999eac", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 18:55:43.594382+00
d504a37e-15c7-48b5-980e-8fdbc6e10091	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_returned	369217838071676931	{"reason": "auto_closed_by_reassignment", "asset_tag": "AST-00083", "employee_id": "JMV000000", "assignment_id": "95b81f3d-0ede-4565-9a7b-66a726999eac", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 18:56:02.841988+00
2c04d174-67a5-4771-8ac0-835c5e474a36	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_assigned	369217838071676931	{"asset_tag": "AST-00083", "employee_id": "EMP-001", "assignment_id": "26d07ef5-5d98-4100-aac2-40e07782388f", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": "JMV000000", "previous_employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 18:56:02.841988+00
170a44a4-a7aa-4d24-b073-10935278485b	35a329a9-cbb1-4a33-b539-a5612c18fbe5	asset_returned	369217838071676931	{"asset_id": "35a329a9-cbb1-4a33-b539-a5612c18fbe5", "asset_tag": "AST-00085", "assignment_id": "2f97e48c-06cb-419d-b91a-c1423ecbbfc4", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "previous_employee_id": "EMP-001", "previous_employee_name": "IT_OPs---John"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:32:54.344369+00
409f7d40-00bd-4a00-ab3c-0287c63ff161	35a329a9-cbb1-4a33-b539-a5612c18fbe5	asset_assigned	369217838071676931	{"asset_tag": "AST-00085", "employee_id": "EMP-001", "assignment_id": "16a197f7-2f44-4178-b9ce-5487912a13c9", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:33:09.813931+00
1235e7a8-6d3c-443a-a111-67a07a1083a4	1368ac5e-36f2-4fec-97d2-9523d39191ca	asset_returned	369217838071676931	{"asset_id": "1368ac5e-36f2-4fec-97d2-9523d39191ca", "asset_tag": "AST-00084", "assignment_id": "ab596b3d-c9e3-48a5-be08-c905f821fa9d", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "previous_employee_id": "JMV000000", "previous_employee_name": "Employee Asset"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:33:21.804257+00
c549d202-3c24-42e2-978d-5b7931bb7523	1368ac5e-36f2-4fec-97d2-9523d39191ca	asset_assigned	369217838071676931	{"asset_tag": "AST-00084", "employee_id": "JMV000000", "assignment_id": "16b5e079-b6c9-49b3-a0dd-d6fb726be56b", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:33:27.120613+00
34ffd7a0-b894-4cf1-8649-21d2a349178d	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_returned	369217838071676931	{"asset_id": "1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18", "asset_tag": "AST-00083", "assignment_id": "26d07ef5-5d98-4100-aac2-40e07782388f", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "previous_employee_id": "EMP-001", "previous_employee_name": "IT_OPs---John"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:33:50.539988+00
5b73da0c-010d-4d66-86b4-13acd7ea494b	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_assigned	369217838071676931	{"asset_tag": "AST-00083", "employee_id": "EMP-001", "assignment_id": "3fd5fe0b-606d-4b95-89a2-d70d9865f4d0", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:33:56.086972+00
c60aabf6-a0cd-4b69-ad29-f6c5c433655d	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_updated	369217838071676931	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "custom_fields", "category_id", "manufacturer_id", "location_id"], "changes": [{"after": "10.02.93.03", "field": "custom_fields.wifi", "label": "Custom Fields: Wifi", "before": null}, {"after": "JMV_LPS_LTD,_W-50,_S", "field": "location_code", "label": "Location Code", "before": null}, {"after": "JMV LPS LTD, W-50, Sector-11, Noida, Gautam Buddha Nagar, Uttar Pradesh, 201301", "field": "location_name", "label": "Location Name", "before": null}], "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}}	\N	\N	2026-04-27 19:34:22.853185+00
ab2b53ce-a196-4034-b2ed-b3ae6c29d557	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_deleted	369217838071676931	{"reason": null, "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "recycle_bin_id": "4d84df73-8d60-4bb8-b5f1-4cee70cda442"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:39:32.66652+00
3df91cf1-2236-4949-b8fa-7c71889e5844	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	asset_restored	369217838071676931	{"actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "recycle_bin_id": "4d84df73-8d60-4bb8-b5f1-4cee70cda442"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 19:39:48.874561+00
c1414ef8-66a4-48e1-8cbf-c12780c8bc5b	275590b7-be5b-40c6-b4a0-c84f594d6445	asset_assigned	369217581027950595	{"asset_tag": "AST-00082", "employee_id": "JMV10728", "assignment_id": "dd204021-c5fc-42d7-a5dc-980ed7f69f28", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 21:06:53.420142+00
9fa1c39e-609c-4773-9507-351c28524b26	08b27404-425e-4535-a80b-37242577ce98	asset_assigned	369217581027950595	{"asset_tag": "AST-00081", "employee_id": "JMV10728", "assignment_id": "475386ec-b07c-4384-87fe-c534533c25b2", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 21:06:53.522203+00
b785185d-64c1-4802-acfc-23a4ef66b7c8	275590b7-be5b-40c6-b4a0-c84f594d6445	asset_assigned	369217581027950595	{"asset_tag": "AST-00082", "idempotent": true, "employee_id": "JMV10728", "assignment_id": "dd204021-c5fc-42d7-a5dc-980ed7f69f28", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 21:07:49.053924+00
12a462c6-300e-4cb3-ac3a-9ff32f54f82c	08b27404-425e-4535-a80b-37242577ce98	asset_assigned	369217581027950595	{"asset_tag": "AST-00081", "idempotent": true, "employee_id": "JMV10728", "assignment_id": "475386ec-b07c-4384-87fe-c534533c25b2", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 21:07:49.100714+00
152ab87b-5937-4afc-b239-4c2347899a7a	8226c4da-3deb-4504-8617-5f0338a26cf5	asset_updated	369217581027950595	{"op": "asset.update_status", "source": "bulk_update", "changes": [{"after": "lost", "field": "status", "label": "Status", "before": "in_stock"}], "new_status": "lost", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 21:07:49.172117+00
61aec7cf-2d57-43fd-b3aa-13c4233c7f01	b2fc015b-7de0-420a-b457-81f753a7ed42	asset_updated	369217581027950595	{"op": "asset.update_status", "source": "bulk_update", "changes": [{"after": "disposed", "field": "status", "label": "Status", "before": "in_stock"}], "new_status": "disposed", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-27 21:07:49.22092+00
628c1485-3462-42d2-981a-f0a98e8a8fac	b2fc015b-7de0-420a-b457-81f753a7ed42	asset_updated	369217838071676931	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "warranty_expiry", "custom_fields", "category_id", "manufacturer_id"], "changes": [{"after": "2026-04-30", "field": "warranty_expiry", "label": "Warranty Expiry", "before": null}], "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}}	\N	\N	2026-04-27 21:41:00.319569+00
663579ff-44ce-4bc9-909e-87cee976d899	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_assigned	369217838071676931	{"asset_tag": "AST-00080", "employee_id": "EMP-001", "assignment_id": "56e8350b-5eb6-469f-a08e-d4ca2761b710", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 21:45:01.997501+00
631ca66f-2384-4483-8cc8-6003c86e73c7	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_assigned	369217838071676931	{"asset_tag": "AST-00080", "employee_id": "JMV000000", "assignment_id": "e107356e-3403-41d2-b244-e887aef9b364", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": "EMP-001", "previous_employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 21:45:43.58445+00
dde35936-71e2-432c-8139-f0435cd83e8e	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_returned	369217581027950595	{"asset_id": "229cb8a0-bede-408e-bd5f-25b3451a2b02", "asset_tag": "AST-00080", "assignment_id": "e107356e-3403-41d2-b244-e887aef9b364", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "previous_employee_id": "JMV000000", "previous_employee_name": "Employee Asset"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 22:01:56.033549+00
9fd61b57-e7d6-48d8-9fb7-eebb09c300b0	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_assigned	369217581027950595	{"asset_tag": "AST-00080", "employee_id": "EMP-001", "assignment_id": "81dc5883-302c-4b68-b4ba-7b036342b948", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 22:03:20.387441+00
a6f3c0db-8ecf-49e4-ae93-ea79b9624420	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_returned	369217581027950595	{"asset_id": "229cb8a0-bede-408e-bd5f-25b3451a2b02", "asset_tag": "AST-00080", "assignment_id": "81dc5883-302c-4b68-b4ba-7b036342b948", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "previous_employee_id": "EMP-001", "previous_employee_name": "IT_OPs---John"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-27 22:07:36.060942+00
de8b15c4-1745-4cac-bf8d-481092d43067	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_assigned	369217581027950595	{"asset_tag": "AST-00080", "employee_id": "JMV10728", "assignment_id": "f46c4419-7ade-4a6d-b6a5-0b7935815ed4", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 06:42:49.85816+00
564d9cb1-a527-4a12-846d-62f91dad8fd2	229cb8a0-bede-408e-bd5f-25b3451a2b02	asset_returned	369217838071676931	{"asset_id": "229cb8a0-bede-408e-bd5f-25b3451a2b02", "asset_tag": "AST-00080", "assignment_id": "f46c4419-7ade-4a6d-b6a5-0b7935815ed4", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "previous_employee_id": "JMV10728", "previous_employee_name": "Bikash Prasad Barnwal"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 07:15:21.158325+00
afb9fdb2-8f9f-4b44-bcbf-9ff92cf43e5a	08b27404-425e-4535-a80b-37242577ce98	asset_assigned	369217838071676931	{"asset_tag": "AST-00081", "employee_id": "JMV000000", "assignment_id": "10d4f80a-145c-4477-a695-1be9de6d61fe", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217838071676931", "actor_name": "IT_OPs---John", "actor_department": "SOFTWARE", "actor_employee_id": "EMP-001"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": "JMV10728", "previous_employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 07:16:43.008134+00
e33fe8f2-a0d8-497c-ac6a-e81cd8ff95f8	08b27404-425e-4535-a80b-37242577ce98	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "category_id", "manufacturer_id"], "changes": [{"after": null, "field": "custom_fields.google_profile", "label": "Custom Fields: Google Profile", "before": "yes"}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-28 08:16:02.923767+00
18274dbc-c097-4f00-83b3-7a6e556ed1f4	275590b7-be5b-40c6-b4a0-c84f594d6445	asset_returned	369217581027950595	{"asset_id": "275590b7-be5b-40c6-b4a0-c84f594d6445", "asset_tag": "AST-00082", "assignment_id": "dd204021-c5fc-42d7-a5dc-980ed7f69f28", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "previous_employee_id": "JMV10728", "previous_employee_name": "Bikash Prasad Barnwal"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 18:54:23.062864+00
9c712c86-115c-460a-a603-bceb2f26b19b	275590b7-be5b-40c6-b4a0-c84f594d6445	asset_assigned	369217581027950595	{"asset_tag": "AST-00082", "employee_id": "EMP-001", "assignment_id": "fb496e2e-febc-4053-8328-7c605d2a0e77", "employee_name": "IT_OPs---John", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "previous_employee_id": null, "previous_employee_row_id": null}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 18:56:09.811691+00
9f4f1fe7-d7c7-4b1f-97ae-2dad8884f27e	275590b7-be5b-40c6-b4a0-c84f594d6445	asset_assigned	369217581027950595	{"asset_tag": "AST-00082", "employee_id": "JMV000000", "assignment_id": "e7445396-2ae8-4792-888f-18a384d589bf", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": "EMP-001", "previous_employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 18:56:41.710653+00
60495a5d-cae1-4405-a470-a8266eefc13b	275590b7-be5b-40c6-b4a0-c84f594d6445	asset_returned	369217581027950595	{"asset_id": "275590b7-be5b-40c6-b4a0-c84f594d6445", "asset_tag": "AST-00082", "assignment_id": "e7445396-2ae8-4792-888f-18a384d589bf", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "previous_employee_id": "JMV000000", "previous_employee_name": "Employee Asset"}	127.0.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-28 18:57:30.925244+00
06ae85a7-2abc-4409-949d-f2e36e7598e6	f24f2b61-a523-47c9-8460-ea95b8715c25	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "category_id", "manufacturer_id"], "changes": [{"after": "12-01-2024", "field": "custom_fields.system_assign_date", "label": "Custom Fields: System Assign Date", "before": "12-Jan-2024"}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-29 09:49:06.40394+00
16daf716-5c01-447f-962f-e73c77e4b7c1	f24f2b61-a523-47c9-8460-ea95b8715c25	asset_updated	369217581027950595	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "metadata", "category_id", "manufacturer_id"], "changes": [{"after": null, "field": "metadata.source", "label": "Source", "before": "bulk_import"}, {"after": null, "field": "metadata.template_version", "label": "Template Version", "before": 5}, {"after": null, "field": "metadata.category_mode", "label": "Category Mode", "before": "predefined"}, {"after": "test", "field": "metadata.notes", "label": "Notes", "before": null}], "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}}	\N	\N	2026-04-29 20:01:48.179143+00
06a53798-dbd9-435b-8c49-ab619bb2cc8f	f24f2b61-a523-47c9-8460-ea95b8715c25	asset_assigned	369217581027950595	{"asset_tag": "AST-00059", "employee_id": "JMV10728", "assignment_id": "38799292-b3be-4753-81f1-f4261b5b64d6", "employee_name": "Bikash Prasad Barnwal", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99", "previous_employee_id": null, "previous_employee_row_id": null}	172.22.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-29 20:02:03.901542+00
068c726d-61fb-4bd3-99ca-357622e59dba	f24f2b61-a523-47c9-8460-ea95b8715c25	asset_assigned	369217581027950595	{"asset_tag": "AST-00059", "employee_id": "JMV000000", "assignment_id": "4f2aa392-d032-4070-87d8-1f347def0a09", "employee_name": "Employee Asset", "actor_snapshot": {"actor_sub": "369217581027950595", "actor_name": "Bikash Prasad Barnwal", "actor_department": "SOFTWARE", "actor_employee_id": "JMV10728"}, "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764", "previous_employee_id": "JMV10728", "previous_employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	172.22.0.1/32	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-04-29 20:02:35.174025+00
\.


--
-- Data for Name: asset_logs; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.asset_logs (id, asset_id, actor_employee_id, note, qr_code, metadata, created_at) FROM stdin;
695ea4d7-b94c-43e9-9020-130fb0553ee1	45169de5-ee4e-453f-8892-9f6180409843	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 16:10:55.987495+00
6d1a298a-1286-4a4d-ae59-62c3d1b302e7	03729af2-c17f-4e3a-893f-52a6e5b45a5a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00004.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "purchase_date", "warranty_expiry", "custom_fields", "category_id", "manufacturer_id"]}	2026-04-27 16:33:48.831864+00
6a2e7faf-8b47-4938-a97e-1246ade7ab6f	03729af2-c17f-4e3a-893f-52a6e5b45a5a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00004.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "purchase_date", "warranty_expiry", "custom_fields", "category_id", "manufacturer_id"]}	2026-04-27 16:34:21.143516+00
b7f01c70-5e88-49c0-9e9a-38b4e6f1faaa	03729af2-c17f-4e3a-893f-52a6e5b45a5a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00004.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 16:49:47.714256+00
bb948c42-1d7e-453b-bf37-59d94b51b48d	03729af2-c17f-4e3a-893f-52a6e5b45a5a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00004.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 16:50:18.045857+00
de8a2840-b5bd-475f-a1d2-f5e96a552264	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV10728", "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	2026-04-27 16:54:59.549635+00
40f91360-a185-4894-9ecb-8ae5fda01a3c	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 16:56:18.530241+00
9581989d-e87c-479a-ad57-fe4ae1cfd294	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00003.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 16:57:32.943353+00
4fec6e77-fb50-45aa-8f45-1f7b4656e08b	03729af2-c17f-4e3a-893f-52a6e5b45a5a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00004.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:05:30.63121+00
2e158d26-f487-46b1-a935-279ec141ae28	03729af2-c17f-4e3a-893f-52a6e5b45a5a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00004.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:05:59.947428+00
f07ba79e-845b-476d-9704-1c5a60085fa0	65d74d1a-16d6-4348-b6b5-cdbf0607f092	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:24:39.560524+00
19cc7043-5d41-4c66-8722-c7b54ac92f49	65d74d1a-16d6-4348-b6b5-cdbf0607f092	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00006.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:25:01.217366+00
aa07867d-e52b-407c-a0c5-d57e3e672527	65d74d1a-16d6-4348-b6b5-cdbf0607f092	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00006.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:30:23.437277+00
67f0b35f-86b7-4f40-afbd-f3103c617751	65d74d1a-16d6-4348-b6b5-cdbf0607f092	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00006.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:36:52.883071+00
32093e1f-0325-45c5-a351-189db153ddfd	65d74d1a-16d6-4348-b6b5-cdbf0607f092	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00006.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:38:17.791715+00
124dd3dc-2e00-4f42-993a-47645b46c8df	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00003.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:38:51.396525+00
1f963e6a-b034-4189-90b1-c4513ab52e08	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Status changed to retired.	\N	{"op": "asset.update_status", "source": "asset_edit"}	2026-04-27 17:38:51.419016+00
1eaf9aea-2524-4c78-b749-4eea29aebcc6	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00003.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "purchase_date", "warranty_expiry", "custom_fields", "metadata", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 17:39:12.199932+00
3a72490f-2276-4560-aa73-eb2afa55de85	02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Status changed to in_stock.	\N	{"op": "asset.update_status", "source": "asset_edit"}	2026-04-27 17:39:12.218166+00
0e5bd2e4-329d-4e8d-a205-f22ebc99695e	8226c4da-3deb-4504-8617-5f0338a26cf5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.382267+00
f862f568-cbb1-4ee5-b457-89dd598a9eff	b2fc015b-7de0-420a-b457-81f753a7ed42	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.39263+00
d5e6ffcc-0ab0-4051-911a-2eb7aa3f27f4	5833dcdf-ae66-4927-ab7f-4cce4127aba9	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.409441+00
5edd0ca2-7c8d-4cb1-9e64-71d58d84e4ee	dcffc33a-315e-4add-b7c2-1fc9f1db6d15	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.419406+00
d7b60422-b02d-414f-b4cf-b38f441806e3	15021812-cb39-4c4b-a655-cb017eaed378	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.4295+00
a145ae4d-24d2-4e10-9592-5d5f40b7475f	77aa569c-4e31-4632-9487-c5ef03726679	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.4403+00
69380964-84d8-4217-b972-a14794599c82	e3c8c011-e10c-4676-a2d0-c09c1d26233c	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.448158+00
ce6a107d-6e0c-49d1-b94f-623038184f17	e101e906-e143-42dd-a3ef-4cc3bc094abb	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.456055+00
94519646-86a8-40f9-bf36-b827dc5a1528	40e641b5-ab8c-4265-906a-4b45f9302dc8	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.464176+00
d71bb20f-8563-4355-be76-6e45a4b64187	d4dcf8f5-ab64-4301-86b6-e23df08cc0d0	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.477211+00
27523a15-c0e2-4fed-a1bd-acae7cc54f35	05bde49c-8e1f-46c1-9517-0c0f6665ebd5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.488638+00
a1bfa80b-9c25-4f7a-b073-21b2876c1501	21133702-dca1-46e8-b772-7e3244418dc2	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.496893+00
f1188b06-3ebb-4547-9528-ea865dd5748f	857590e4-9b65-4508-9225-345531a780e1	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.506638+00
4a75faba-5853-46c3-a2f1-a55801d81507	51e9d0bb-3dda-46ed-8836-86fd30d50f6d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.516152+00
b74cc519-79a0-485c-89bd-d94f12f3f963	a82f8c5e-1593-4acf-bd23-060bf15c2f19	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.526303+00
7cbc8788-97fa-4973-9b16-d1759602f29d	4590b456-c65e-4934-b1b8-6376021ce0da	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.535698+00
eac14cd3-a828-4f49-b374-3c6f682f1530	83b36b6c-a81f-45ba-87ae-611bfb24f9cb	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.542973+00
8b271f19-0a27-4588-94e7-f918949a6d80	ff5b51da-b2d1-4a97-8a07-b1b4b25deb80	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.552384+00
e242424c-ab27-4f7a-acb6-1de10f954aaf	921f5107-abe7-467c-ad87-42f477152a8e	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.56058+00
c21985ae-00e5-4e83-9930-5f0bbfc38482	3cd515c8-ee0d-4573-a0d0-f5a9fd6bd4ca	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.569655+00
bc0b9fe9-0891-4f6b-8a20-54acf2eb47a4	bd6579ab-2427-4d32-a222-c2a3fca1124d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.576102+00
5f24cbf6-ad5d-456f-a47a-1a099e327fbc	fd33d904-5643-480e-b1c9-c63b29be2d5d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.588146+00
056230b1-950c-45a1-aa9a-544bc68b3c93	0df3b1a8-59f0-451a-bc5a-c031ec630880	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.595848+00
baff9d84-6b11-4e4c-8800-cc00ee955069	a7097b04-5b39-4ce4-b574-da5eca58fb6f	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.604006+00
6a578541-9d70-48f3-8a92-9d42f24322db	5790de0e-0a40-411a-b481-038579bd0ac7	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.612759+00
98b4309e-697a-446e-8570-d3d1daa8e881	c443c0b4-9091-4178-9c9f-b9cb5372c0f5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.620553+00
1202ee4e-99ea-4bab-8fd2-53f1b1cee949	1152694a-4469-45a7-b47c-86c4efb8be2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.62974+00
354e4f61-1894-4032-8438-9cc8d3ea3bbe	0ff3d012-0468-4957-9b30-2bd84f5272bf	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.636106+00
7bde467a-294c-46a8-bfb6-7412515be311	a3159dfa-66ee-440d-a222-bfa4e1231cfb	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.643466+00
503cd04f-e63b-4282-bc1b-d95401e26569	b81838d6-c874-4767-990f-50ac73ef498b	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.649401+00
e6e00201-06ef-4f7a-8c6f-7a4283f0d34c	dab12aa5-61a0-463d-9044-d40de34564ec	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.655648+00
0472448c-3b79-402c-885c-9b1ffbabdb88	ffa3d944-619f-437c-88c0-4e0a3f0c397b	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.663403+00
f19b3c67-0b3f-48ae-b2d5-6b3c0c0324f0	ae34fa01-97ae-4a57-a17a-5bc48b6a3610	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.669293+00
a7ac06d8-901d-407b-afeb-b3bf88e0bc6a	e49a4201-b7c4-435c-9c61-3ad3b8cdbc29	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.678105+00
b0b9f0ae-406b-4d69-b8f2-c4ab492b94d8	03cf7d40-3dcf-4f86-8566-2070219ac5d4	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.684015+00
60440f39-e884-492f-906e-c1909db2bb7c	a7fdd538-556f-48bb-9851-352dc3f3dc88	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.692855+00
8a351cbd-d44f-49a7-bbcc-f0b3de413435	63cc972c-8cbc-4606-89fb-008313abf5ee	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.700405+00
426d06dd-9466-4f95-9058-9a58d0b002d9	51551950-e506-4c07-8afc-224bb58107e4	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.70823+00
2722fdd1-d920-4f84-99ff-8ea87cf79182	3ef3a699-afd0-4ce1-8235-c58e3a7836d4	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.715045+00
44104ad9-af15-4648-96da-474ee96f764b	933ccedb-4540-49d6-96b0-3f7bedbbe9d8	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.722525+00
d5ad9912-2619-498a-a6d0-61112e91eb43	c90e4969-0b48-4653-9921-d06cfe26e2f6	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.729167+00
ac493c66-88d4-4650-ac98-d12bab8b0f36	8ae52916-5d92-4900-89ff-19da32450d3a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.737048+00
4c2fd422-4d0a-476f-8540-54ad4d234622	0c49735f-429c-4f5d-95f7-f14b11c4cf84	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.7432+00
21573140-46ab-4076-99a8-56e5f5d5568a	6d489933-36ba-4ccc-b06c-221c62fd966c	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.751921+00
2cd85586-8267-49a9-b837-184c3c8fb259	10d79a90-9ab5-4d8b-9c2d-22f43631a19a	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.757907+00
6582b78c-e34a-42f8-9e1c-77b99ea071c5	f1764a8d-9812-466b-a17b-c86e441b6247	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.763472+00
2e0e90cc-ecf5-448d-8e25-5c0dc79e46f6	654e643d-542e-4b7e-b94a-f99b7c07438d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.773905+00
b12de905-84f3-4017-b011-8b8e60791c9d	5d7bcd6f-7379-494e-b06a-b45a0ed2a4ff	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.781695+00
b70cb4cf-af0f-4927-a518-1c80bd2aacf4	f3e34b2d-2f29-4a6c-859e-b47a3bb7aa2d	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.789877+00
b73e7d4b-2459-4543-a54d-4628e28d359f	6551849d-09bb-4a9d-98d8-055c731d70be	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.796935+00
e5b916c6-5aaa-4b82-975b-f68cdd6341c1	509779b8-2bd0-4453-9360-3fd333fb598e	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.804164+00
b9106334-a709-410d-81b5-4be02edfdfc4	8f83997a-a6c3-4397-8ef3-cee870a58bc0	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.810731+00
1099bcc4-e5d8-4916-8201-460664d31b21	f24f2b61-a523-47c9-8460-ea95b8715c25	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.820744+00
3aa2dcab-a683-4dc6-9350-eca5e52c57bc	4c260f2b-30cd-45e7-8dc6-9e55745d5e79	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.828043+00
1f92a0ac-6503-4e40-a339-9823291bec23	e9bfa722-2e74-46d2-8c90-cd116d32cc88	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.836993+00
d55115c9-6c82-44d0-b4bd-6753c028dee0	4fe9b66d-383b-47d9-b2fa-34f4859b957c	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.846942+00
0d310f30-215e-48a1-b141-11c29e88aced	f3d72b26-f9a1-4672-800a-d02119ec62e9	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.853947+00
862ebf27-5e57-4a86-9c50-6cd1d9f350c0	614fd419-7916-4bb3-a81b-3c2368b697d7	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.862067+00
c86f9066-fa7f-4898-b19f-cfd96cd9399d	15e14696-ff31-4654-8d9a-d67f6e3181c3	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.868971+00
8c34f7e1-d4a6-417c-9e8f-deb490b9beef	826dc9e9-17b2-46fa-a97e-0bbc3ef5b4d2	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.876406+00
194e6b6a-3f9b-47f1-8c3f-e9368c1e0e74	b7295a08-171e-4325-a5a8-447813703223	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.883699+00
5d862ba1-e3f2-4974-993b-d41804d80295	7bc90958-b4ec-47a8-b2cd-43c8a45e1a5f	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.890819+00
48f093ff-9a45-4294-b99e-70d4b23e0138	b250d0f5-0cd9-4e8b-9e02-6af7ca77ce7c	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.897615+00
b2848bfc-5944-4c8c-9b85-03d47fc45394	0abb8b00-a9e4-4fd3-a3d4-8f56c48c0caf	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.904328+00
fb50fb7b-8a97-47a0-a773-cbe0b4a24980	a6825968-96b6-410b-bfe9-513256291d49	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.91376+00
20251cbd-574c-484b-8070-f9983064c8ae	a0f6a0e9-270c-4929-9747-f2b9829bda02	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.91975+00
cda37f16-08e1-4d82-98ec-037c1f345aa4	4a8f9463-4696-44e1-a501-c37e49ebeceb	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.927693+00
2ec8cca7-05e2-44db-8bd2-c10a0bb78998	c35969f5-a49e-4681-931e-2cb29d56b0b7	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.934051+00
fa9178ac-e6a6-423c-9b40-f4462a045cb3	be384b0d-ce35-450b-972e-ec68875679f6	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.943166+00
8757af2f-4a39-4695-927f-6a37fbee925c	27a4dccd-a947-4408-ad51-a2436d362e38	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.950956+00
fb58a12a-6df1-4968-a77c-6e5f212d3062	2de7b168-081d-4c45-a497-0e69b6852f7f	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.960142+00
00c3d4d2-ad33-4612-acac-60fbae24c125	a9edce28-ab93-46c5-beb0-ed1f0c071728	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.968963+00
f82b90ed-f048-46c1-9e39-14d8c9a4275e	a3784996-4016-45f7-a2ab-661e0808b4ac	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.978039+00
5333c909-946d-4310-a5a6-0e5cbe78b977	229cb8a0-bede-408e-bd5f-25b3451a2b02	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.987627+00
5690d43f-910f-47cf-8e5c-bb66dd58f00a	08b27404-425e-4535-a80b-37242577ce98	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:43.994997+00
19577a79-3abc-48fb-886d-35a367892072	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:44.003644+00
8050aedf-b261-4de0-b505-19adb4bec826	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:44.011101+00
1aafc1fa-ecbd-419f-b376-b8a60e96ccc4	1368ac5e-36f2-4fec-97d2-9523d39191ca	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:44.020014+00
2bae914f-c807-4331-ae39-4d4a85050542	35a329a9-cbb1-4a33-b539-a5612c18fbe5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset created manually.	\N	{"op": "asset.create"}	2026-04-27 17:41:44.027893+00
9447d9ca-ea39-4b17-8606-ae45f7ceccae	35a329a9-cbb1-4a33-b539-a5612c18fbe5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00085.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "metadata", "category_id", "manufacturer_id"]}	2026-04-27 17:49:56.742431+00
bc255ae8-82c3-41f0-a2a7-8e7c34677d6f	35a329a9-cbb1-4a33-b539-a5612c18fbe5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV10728", "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	2026-04-27 17:52:19.422192+00
70e09f3f-4351-49a9-a93a-01ee64181e69	35a329a9-cbb1-4a33-b539-a5612c18fbe5	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-27 17:52:49.050726+00
ffd42bae-db39-4dd6-a1d8-920267772200	1368ac5e-36f2-4fec-97d2-9523d39191ca	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to JMV000000.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-27 18:54:06.57671+00
c8c767f9-3807-4d29-b85a-f138f121b0c9	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to JMV000000.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-27 18:54:23.625633+00
b976362a-e465-44de-a7a6-feb0b9edb58e	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 18:55:19.628478+00
dc39af4a-d8c7-49e1-a2b9-0b2467e8899f	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to JMV000000.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-27 18:55:43.594382+00
1b01242b-26cd-46de-a5ed-3d17ae128412	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-27 18:56:02.841988+00
ba1893e8-d2d5-4ef5-9532-481f0c7c46de	35a329a9-cbb1-4a33-b539-a5612c18fbe5	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 19:32:54.344369+00
c3bae7d4-7ae8-4d26-b43d-30de4747f94a	35a329a9-cbb1-4a33-b539-a5612c18fbe5	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-27 19:33:09.813931+00
e9ffc44b-d9f4-4685-bad5-0aa0e914341a	1368ac5e-36f2-4fec-97d2-9523d39191ca	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 19:33:21.804257+00
5f9b53f5-c15e-4014-9a57-cf688bff711e	1368ac5e-36f2-4fec-97d2-9523d39191ca	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to JMV000000.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-27 19:33:27.120613+00
1a6a4c16-d875-43bb-b808-1ec77be24e50	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 19:33:50.539988+00
5f3b2866-e5c8-4a59-b12b-df09f0defa6a	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-27 19:33:56.086972+00
9fbfb65b-92a4-47e5-8dc6-177943fdbddc	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset details updated via PATCH /api/v1/assets/tag/AST-00083.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "location_name", "custom_fields", "category_id", "manufacturer_id", "location_id"]}	2026-04-27 19:34:22.862816+00
6af254c3-b6db-4f36-9a01-107f9e0a1b1f	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset soft-deleted.	\N	{"op": "asset.soft_delete"}	2026-04-27 19:39:32.670959+00
c256af1c-48b1-4c4d-8a76-37e0bbbab08f	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset restored from recycle bin.	\N	{"op": "asset.restore"}	2026-04-27 19:39:48.883389+00
4a6d94b4-f0f5-4376-9479-e84c0ab27f43	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV10728", "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	2026-04-27 21:06:53.420142+00
a8d9d195-851e-49e2-bb9e-6031463493aa	08b27404-425e-4535-a80b-37242577ce98	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV10728", "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	2026-04-27 21:06:53.522203+00
fd1ce949-ae4a-4936-90fa-49c71c93fa68	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Assignment no-op: already held by JMV10728.	\N	{"op": "assignment.assign", "idempotent": true}	2026-04-27 21:07:49.053924+00
894fcebe-4b1f-42f4-a921-b3ee2a293ca5	08b27404-425e-4535-a80b-37242577ce98	9ab281f1-c379-4f58-9156-d0c65da75e99	Assignment no-op: already held by JMV10728.	\N	{"op": "assignment.assign", "idempotent": true}	2026-04-27 21:07:49.100714+00
46a0b587-a2f2-4f9e-8eda-3dd82dc4440d	8226c4da-3deb-4504-8617-5f0338a26cf5	9ab281f1-c379-4f58-9156-d0c65da75e99	Status changed to lost.	\N	{"op": "asset.update_status", "source": "bulk_update"}	2026-04-27 21:07:49.178737+00
eff8a5f3-90a8-4291-b8d4-7351b562b8cf	b2fc015b-7de0-420a-b457-81f753a7ed42	9ab281f1-c379-4f58-9156-d0c65da75e99	Status changed to disposed.	\N	{"op": "asset.update_status", "source": "bulk_update"}	2026-04-27 21:07:49.226577+00
6c49bba7-5760-4b8c-b692-50cb15a991f3	b2fc015b-7de0-420a-b457-81f753a7ed42	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset details updated via PATCH /api/v1/assets/tag/AST-00008.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "warranty_expiry", "custom_fields", "category_id", "manufacturer_id"]}	2026-04-27 21:41:00.322842+00
82b23b7b-d8a6-4dd6-8f67-800a4fc419fa	229cb8a0-bede-408e-bd5f-25b3451a2b02	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-27 21:45:01.997501+00
2f23be3f-cde6-4c9b-91a6-b02a5eea0f5e	229cb8a0-bede-408e-bd5f-25b3451a2b02	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset reassigned to JMV000000 from EMP-001.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-27 21:45:43.58445+00
8ef4bc83-f0e7-44be-944e-7cfbffad0c1b	229cb8a0-bede-408e-bd5f-25b3451a2b02	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 22:01:56.033549+00
21a2042a-9a96-48d1-84e7-405ec4500d67	229cb8a0-bede-408e-bd5f-25b3451a2b02	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-27 22:03:20.387441+00
382d54b5-fa3a-4c3b-a2dc-2349170b9a50	229cb8a0-bede-408e-bd5f-25b3451a2b02	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset returned.	\N	{"op": "assignment.return"}	2026-04-27 22:07:36.060942+00
09a63283-99c5-4792-9413-4d5af39154cc	229cb8a0-bede-408e-bd5f-25b3451a2b02	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV10728", "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	2026-04-28 06:42:49.85816+00
6edeef35-104e-4e60-801e-76dabea3481b	229cb8a0-bede-408e-bd5f-25b3451a2b02	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset returned.	\N	{"op": "assignment.return"}	2026-04-28 07:15:21.158325+00
b005d373-70dd-432b-80d6-38cd1a058d8d	08b27404-425e-4535-a80b-37242577ce98	4bf322c0-7045-4a3a-8206-0723bfe24b94	Asset reassigned to JMV000000 from JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-28 07:16:43.008134+00
01e6d803-ae60-41d2-ae61-9e7a5f367c14	08b27404-425e-4535-a80b-37242577ce98	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00081.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "category_id", "manufacturer_id"]}	2026-04-28 08:16:02.932505+00
1839ce6b-87c8-4911-9135-26d5a38417ad	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset returned.	\N	{"op": "assignment.return"}	2026-04-28 18:54:23.062864+00
a8e07035-a29a-477c-bc85-11f537917df7	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to EMP-001.	\N	{"op": "assignment.assign", "employee_id": "EMP-001", "employee_row_id": "4bf322c0-7045-4a3a-8206-0723bfe24b94"}	2026-04-28 18:56:09.811691+00
14729aa5-ccfd-4938-ad9b-86438fa53053	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset reassigned to JMV000000 from EMP-001.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-28 18:56:41.710653+00
357104ff-5352-4aca-b01f-cfc01076eee8	275590b7-be5b-40c6-b4a0-c84f594d6445	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset returned.	\N	{"op": "assignment.return"}	2026-04-28 18:57:30.925244+00
7fdd0bce-9bb4-4bef-b10c-0d8094d94e6b	f24f2b61-a523-47c9-8460-ea95b8715c25	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00059.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "category_id", "manufacturer_id"]}	2026-04-29 09:49:06.413062+00
4a3ec7c6-c423-4575-9d1d-51e60e940ccc	f24f2b61-a523-47c9-8460-ea95b8715c25	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset details updated via PATCH /api/v1/assets/tag/AST-00059.	\N	{"op": "asset.update_by_tag", "fields": ["category_slug", "manufacturer_name", "model", "serial_number", "custom_fields", "metadata", "category_id", "manufacturer_id"]}	2026-04-29 20:01:48.192562+00
73aa27ec-eca0-4816-805a-01758cdda148	f24f2b61-a523-47c9-8460-ea95b8715c25	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset assigned to JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV10728", "employee_row_id": "9ab281f1-c379-4f58-9156-d0c65da75e99"}	2026-04-29 20:02:03.901542+00
09e0bc61-e574-4c80-b3e4-1a4c607a5fa0	f24f2b61-a523-47c9-8460-ea95b8715c25	9ab281f1-c379-4f58-9156-d0c65da75e99	Asset reassigned to JMV000000 from JMV10728.	\N	{"op": "assignment.assign", "employee_id": "JMV000000", "employee_row_id": "d7595e68-506d-48f0-b2ab-e1d4d5e9f764"}	2026-04-29 20:02:35.174025+00
\.


--
-- Data for Name: assets; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.assets (id, asset_tag, category_id, manufacturer_id, model, serial_number, location_id, custom_fields, status, purchase_date, warranty_expiry, metadata, is_deleted, deleted_at, deleted_by_employee_id, created_at, updated_at, created_by, updated_by, qr_code, created_by_employee_id) FROM stdin;
a66c720b-9875-4a35-b796-09bddd946a53	AST-00001	e2d0052a-3ea6-4454-8b34-e7f29a1577da	a668ba66-c349-4209-aa3b-ff43893bcb02	Quia alias voluptas	Ut cupidatat dolorem	\N	{}	in_stock	1998-07-09	1974-08-15	{"notes": "Sapiente iste ration"}	f	\N	\N	2026-04-27 12:20:55.406427+00	2026-04-27 12:20:55.406427+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
142c2025-f97d-4ffb-8e3e-49269c437b48	AST-00002	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	860e074f-aed2-445a-bc55-46cd73dc557e	Expedita voluptatum	Quo porro dolores vi	\N	{}	in_stock	2018-04-09	2013-03-09	{"notes": "Earum dolor deserunt"}	f	\N	\N	2026-04-27 15:57:35.495935+00	2026-04-27 15:57:35.495935+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
45169de5-ee4e-453f-8892-9f6180409843	AST-00005	41a24405-1881-4029-ab6e-ec471537e67f	e8827520-f87e-4a0f-bd42-124af80a22e6	Obcaecati sint repud	Laborum Dicta magni	\N	{}	in_stock	2020-07-28	1986-03-26	{"notes": "Quis minima aut irur"}	t	2026-04-27 16:30:41.217753+00	9ab281f1-c379-4f58-9156-d0c65da75e99	2026-04-27 16:10:55.955629+00	2026-04-27 16:30:40.862916+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
03729af2-c17f-4e3a-893f-52a6e5b45a5a	AST-00004	9016120c-a281-46ff-8e49-81f059ed164b	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Consequatur Asperna	34567892876	4da76a93-03eb-493e-aa76-1038a694cc45	{"raj": "shaw", "bikash": "barnwal"}	in_stock	1994-05-16	2014-10-16	{"notes": "lorem"}	f	\N	\N	2026-04-27 16:03:22.026562+00	2026-04-27 17:05:59.935299+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
65d74d1a-16d6-4348-b6b5-cdbf0607f092	AST-00006	9016120c-a281-46ff-8e49-81f059ed164b	dd010632-7264-421f-865f-0925ba045f31	Sed sed vel adipisci	Molestias quam itaqu	e17679c0-b5e9-42a5-aba3-a175011e8db6	{"Wifi": "0.0.0.0", "wifi": "18.292.393.90"}	in_stock	1995-11-03	1997-08-09	{"notes": "Enim molestiae labor"}	f	\N	\N	2026-04-27 17:24:39.532695+00	2026-04-27 17:38:17.780251+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
02c4d6c0-8aa5-4c18-b676-a2f40dacab2d	AST-00003	60b7adf3-53cc-4aa9-9418-c6ddf6e860bc	9ad15ee9-fac5-4b63-a738-f5dce5f76750	Lenovo	Consequatur odit ex	e17679c0-b5e9-42a5-aba3-a175011e8db6	{"wifi": "0.0.0.0"}	in_stock	1981-05-20	2002-11-21	{"notes": "lorem10"}	f	\N	\N	2026-04-27 15:57:57.675777+00	2026-04-27 17:39:12.212138+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
5833dcdf-ae66-4927-ab7f-4cce4127aba9	AST-00009	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 5490	6FSN1X2	\N	{"erp": "yes", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "MASTER SSD", "generation": "8th", "mac_(wifi)": "8C-04-BA-0F-BA-B9", "mobile_number": "9311956929", "ram_frequency": "3200", "google_profile": "yes", "ssd_serial_number": "VK2209000067", "system_assign_date": "2023-01-18 00:00:00"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.398744+00	2026-04-27 17:41:43.398744+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
dcffc33a-315e-4add-b7c2-1fc9f1db6d15	AST-00010	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Mouse	7CH2460W31	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.415709+00	2026-04-27 17:41:43.415709+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
15021812-cb39-4c4b-a655-cb017eaed378	AST-00011	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 7280	5KFNPQ2	\N	{"erp": "yes", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "TOSHIBA KXG50ZNV", "generation": "7TH", "mac_(wifi)": "20-16-B9-B0-87-95", "mobile_number": "9910398588", "ram_frequency": "2400", "google_profile": "yes", "ssd_serial_number": "0000_0000_0000_0010_00008_0D03_0039_3C53"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.425646+00	2026-04-27 17:41:43.425646+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
77aa569c-4e31-4632-9487-c5ef03726679	AST-00012	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Mouse	N/A-CND12228624	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.434537+00	2026-04-27 17:41:43.434537+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
e3c8c011-e10c-4676-a2d0-c09c1d26233c	AST-00013	60b7adf3-53cc-4aa9-9418-c6ddf6e860bc	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Keyboard	CND12228624	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.444893+00	2026-04-27 17:41:43.444893+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
e101e906-e143-42dd-a3ef-4cc3bc094abb	AST-00014	9016120c-a281-46ff-8e49-81f059ed164b	\N	G41	N/A-001	\N	{"hdd_(gb)": "500", "ram_(gb)": "4", "ram_type": "DDR3", "ssd_(gb)": "128", "hdd_model": "ST3500312CS", "processor": "Core2Duo", "ssd_model": "OSC SSD", "generation": "E8400", "mobile_number": "9910398588", "google_profile": "yes", "hdd_serial_number": "6VVEFTZ67", "ssd_serial_number": "OSC20081200000000245"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.451717+00	2026-04-27 17:41:43.451717+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
40e641b5-ab8c-4265-906a-4b45f9302dc8	AST-00015	e2d0052a-3ea6-4454-8b34-e7f29a1577da	4b5a4d44-d0c1-4624-a63f-38639eb8c097	V14G3	PG03NXQD	\N	{"erp": "yes", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "UMIS RPJTJ512MGE1QDQ", "generation": "12th", "mac_(wifi)": "08-8E-90-C3-89-08", "mobile_number": "9205989817", "ram_frequency": "3200", "ssd_serial_number": "044A_5002_A1D0_0AD5"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.460478+00	2026-04-27 17:41:43.460478+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
d4dcf8f5-ab64-4301-86b6-e23df08cc0d0	AST-00016	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 5490	4F82XT2	\N	{"ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "512", "mac_(lan)": "C8-F7-50-51-C6-C9", "processor": "I5", "ssd_model": "EVM", "generation": "8th", "mac_(wifi)": "A8-6D-AA-96-C2-D8", "mobile_number": "9910398032", "ram_frequency": "2400", "google_profile": "yes", "ssd_serial_number": "AA000000000000001524", "system_assign_date": "2023-06-02 00:00:00"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.472451+00	2026-04-27 17:41:43.472451+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
05bde49c-8e1f-46c1-9517-0c0f6665ebd5	AST-00017	8815099e-5883-4bd7-82e1-7f8a56673c1c	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Wireless Mouse	1826LZXB3UQ8	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.48297+00	2026-04-27 17:41:43.48297+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
21133702-dca1-46e8-b772-7e3244418dc2	AST-00018	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	f8a9bd5c-c535-434c-b936-2f97e420b233	64Gb Hp712W USB 3.0(by Sachin)	N/A-002	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.493309+00	2026-04-27 17:41:43.493309+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
857590e4-9b65-4508-9225-345531a780e1	AST-00019	e2d0052a-3ea6-4454-8b34-e7f29a1577da	4b5a4d44-d0c1-4624-a63f-38639eb8c097	V14G3	PG04CW2C	\N	{"erp": "yes", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I3", "ssd_model": "WD PC SN740 SDDPMQD-512G-1101", "generation": "12th", "mac_(wifi)": "A0-B3-39-C9-2D-C7", "mobile_number": "9958007319", "google_profile": "yes", "ssd_serial_number": "E823_8FA6_BF53_0001_001B_448B_47C2_2424"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.502668+00	2026-04-27 17:41:43.502668+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
51e9d0bb-3dda-46ed-8836-86fd30d50f6d	AST-00020	8815099e-5883-4bd7-82e1-7f8a56673c1c	566bd7d8-d23c-4f95-988f-afc04f73bdf9	Wireless Mouse	22238LZD2DUV8	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.511804+00	2026-04-27 17:41:43.511804+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
509779b8-2bd0-4453-9360-3fd333fb598e	AST-00057	9016120c-a281-46ff-8e49-81f059ed164b	\N	H81M-CS	N/A-021	\N	{"ram_(gb)": "8", "ram_type": "DDR3", "ssd_(gb)": "128", "processor": "intel Pentium", "ssd_model": "SSD", "generation": "G3220", "ram_frequency": "1400", "ssd_serial_number": "YS20201002571"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.800962+00	2026-04-27 17:41:43.800962+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
b2fc015b-7de0-420a-b457-81f753a7ed42	AST-00008	8815099e-5883-4bd7-82e1-7f8a56673c1c	566bd7d8-d23c-4f95-988f-afc04f73bdf9	Wireless Mouse	2238LZD2D7P8	\N	{}	disposed	\N	2026-04-30	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.38766+00	2026-04-27 21:41:00.304139+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a82f8c5e-1593-4acf-bd23-060bf15c2f19	AST-00021	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 5480	JSPVNN2	\N	{"erp": "yes", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "mac_(lan)": "10-65-30-19-72-F6", "processor": "I5", "ssd_model": "EVMM2", "generation": "7th", "mac_(wifi)": "7C-76-35-6A-D1-E6", "mobile_number": "8448499061", "ram_frequency": "2400", "google_profile": "yes", "ssd_serial_number": "EM3RH072317849", "system_assign_date": "2023-10-06 00:00:00"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.520734+00	2026-04-27 17:41:43.520734+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
4590b456-c65e-4934-b1b8-6376021ce0da	AST-00022	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Mouse	N/A-CND12228637	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.532008+00	2026-04-27 17:41:43.532008+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
83b36b6c-a81f-45ba-87ae-611bfb24f9cb	AST-00023	60b7adf3-53cc-4aa9-9418-c6ddf6e860bc	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Keyboard	CND12228637	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.539599+00	2026-04-27 17:41:43.539599+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
ff5b51da-b2d1-4a97-8a07-b1b4b25deb80	AST-00024	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Elitebook 840 G5	5CG84766N0	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "256", "mac_(lan)": "E4-E7-49-1F-3B-FD", "processor": "I5", "ssd_model": "VALUETECH BASICS", "generation": "7th", "mac_(wifi)": "18-1D-EA-31-55-64", "mobile_number": "9910398585", "ram_frequency": "2133", "google_profile": "Yes", "ssd_serial_number": "YS2022100982036"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.548757+00	2026-04-27 17:41:43.548757+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
921f5107-abe7-467c-ad87-42f477152a8e	AST-00025	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f0baf24b-1c63-4ebb-ab9d-8aeaf36f117a	V14G3	PG04246X	\N	{"erp": "yes", "hdd_(gb)": "512", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I3", "ssd_model": "Micron", "generation": "12", "mac_(wifi)": "C8-5E-A9-22-2D-F1", "mobile_number": "9205989817", "ram_frequency": "3200", "google_profile": "yes", "ssd_serial_number": "00A0_7501_4214_C568", "system_assign_date": "2024-02-19 00:00:00"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.556701+00	2026-04-27 17:41:43.556701+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
3cd515c8-ee0d-4573-a0d0-f5a9fd6bd4ca	AST-00026	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Mouse	N/A-7CH3342QL1	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.565988+00	2026-04-27 17:41:43.565988+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
bd6579ab-2427-4d32-a222-c2a3fca1124d	AST-00027	60b7adf3-53cc-4aa9-9418-c6ddf6e860bc	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Keyboard	7CH3342QL1	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.57345+00	2026-04-27 17:41:43.57345+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
fd33d904-5643-480e-b1c9-c63b29be2d5d	AST-00028	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	\N	Kali Sharma	N/A-003	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.580751+00	2026-04-27 17:41:43.580751+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
0df3b1a8-59f0-451a-bc5a-c031ec630880	AST-00029	9016120c-a281-46ff-8e49-81f059ed164b	\N	H110M-S2	N/A-004	\N	{"hdd_(gb)": "1 TB", "ram_(gb)": "32", "ram_type": "DDR4", "ssd_(gb)": "256", "hdd_model": "TOSHIBA", "mac_(lan)": "E0-D5-5E-02-DA-5D", "processor": "I5", "ssd_model": "SSD", "generation": "7th", "mobile_number": "yes", "ram_frequency": "2400", "hdd_serial_number": "96DAW0LMS", "ssd_serial_number": "AA202209242094", "system_assign_date": "13-Apr-2023", "screen_serial_number": "208NTXRCY522 & 32'", "sim_previously_used_by": "45077"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.591195+00	2026-04-27 17:41:43.591195+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a7097b04-5b39-4ce4-b574-da5eca58fb6f	AST-00030	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 3420	H8QGMG3	\N	{"ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "KBG40ZNS512G  NMVe KIOXIA", "generation": "11th", "mac_(wifi)": "2C-6D-C1-06-48-93", "mobile_number": "yes", "ram_frequency": "3200", "ssd_serial_number": "0100_0000_0000_0000_8CE3_8E04_030F_7C13.", "system_assign_date": "14-Aug-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.600692+00	2026-04-27 17:41:43.600692+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
5790de0e-0a40-411a-b481-038579bd0ac7	AST-00031	8815099e-5883-4bd7-82e1-7f8a56673c1c	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Wireless Mouse	CN-0TGP8R-LO300-26E-03LW-A00	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.607828+00	2026-04-27 17:41:43.607828+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
c443c0b4-9091-4178-9c9f-b9cb5372c0f5	AST-00032	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 5530	JXYQXL3	\N	{"hdd_(gb)": "1TB", "ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "512", "hdd_model": "NVMe WD Blue SN580", "mac_(lan)": "8C-EC-4B-FE-F9-E6", "processor": "I7", "ssd_model": "NVMe KBG50ZNS512G NVMe KIOXIA,", "generation": "12th", "mac_(wifi)": "28-6B-35-08-F7-F0", "mobile_number": "yes", "ram_frequency": "3200", "hdd_serial_number": "E823_8FA6_BF53 0001 001B 4444A 4168 A424", "ssd_serial_number": "0000_0000_0000_0000_8CE3_8E04_03FC_0B34., WDS100T3B0E-00CHF0", "system_assign_date": "17-Jan-2024"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.617283+00	2026-04-27 17:41:43.617283+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
1152694a-4469-45a7-b47c-86c4efb8be2d	AST-00033	8815099e-5883-4bd7-82e1-7f8a56673c1c	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Wireless Mouse	CN-0TGP8R-LO300-257-02EY-A00	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.624774+00	2026-04-27 17:41:43.624774+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
0ff3d012-0468-4957-9b30-2bd84f5272bf	AST-00034	9016120c-a281-46ff-8e49-81f059ed164b	\N	\N	N/A-005	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.632959+00	2026-04-27 17:41:43.632959+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a3159dfa-66ee-440d-a222-bfa4e1231cfb	AST-00035	9016120c-a281-46ff-8e49-81f059ed164b	\N	\N	N/A-006	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.638941+00	2026-04-27 17:41:43.638941+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
b81838d6-c874-4767-990f-50ac73ef498b	AST-00036	9016120c-a281-46ff-8e49-81f059ed164b	\N	\N	N/A-007	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.646568+00	2026-04-27 17:41:43.646568+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
dab12aa5-61a0-463d-9044-d40de34564ec	AST-00037	9016120c-a281-46ff-8e49-81f059ed164b	\N	\N	N/A-008	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.652125+00	2026-04-27 17:41:43.652125+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
ffa3d944-619f-437c-88c0-4e0a3f0c397b	AST-00038	9016120c-a281-46ff-8e49-81f059ed164b	\N	B250M-D2V-CF	N/A-009	\N	{"hdd_(gb)": "500", "ram_(gb)": "32", "ram_type": "DDR4", "ssd_(gb)": "240", "hdd_model": "WDC WD3200BEKT-60PVMT0", "mac_(lan)": "E0-D5-5E-44-58-27", "processor": "I5", "ssd_model": "SATA SSD", "generation": "6th", "mobile_number": "yes", "ram_frequency": "2133", "hdd_serial_number": "WD-WX11A6343829", "ssd_serial_number": "5193070C165D00173516", "screen_serial_number": "208NTVS2R911 & 32'"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.660562+00	2026-04-27 17:41:43.660562+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
ae34fa01-97ae-4a57-a17a-5bc48b6a3610	AST-00039	9016120c-a281-46ff-8e49-81f059ed164b	\N	\N	N/A-010	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.666202+00	2026-04-27 17:41:43.666202+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
8f83997a-a6c3-4397-8ef3-cee870a58bc0	AST-00058	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Elitebook 840 G3	5CG7050Q8N	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "256", "processor": "I5", "ssd_model": "PC401 NVMe SK hynix", "generation": "6th", "mac_(wifi)": "34-F3-9A-B3-F2-04", "mobile_number": "yes", "ram_frequency": "2133", "ssd_serial_number": "ACE4_2E81_7503_9A48", "system_assign_date": "29-Dec-2023", "sim_previously_used_by": "45279"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.807703+00	2026-04-27 17:41:43.807703+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
e49a4201-b7c4-435c-9c61-3ad3b8cdbc29	AST-00040	9016120c-a281-46ff-8e49-81f059ed164b	\N	H410M S2 V2	N/A-011	\N	{"hdd_(gb)": "1 TB", "ram_(gb)": "32", "ram_type": "DDR4", "ssd_(gb)": "256", "hdd_model": "CT3001SC", "mac_(lan)": "D8-5E-D3-C3-7D-E3", "processor": "I7", "ssd_model": "SSD", "generation": "10th", "mobile_number": "yes", "ram_frequency": "2933", "hdd_serial_number": "CTB0105AYX05958", "ssd_serial_number": "YS20221024565670707", "system_assign_date": "09-Mar-2023", "screen_serial_number": "208NTXRGD882 & 32'", "sim_previously_used_by": "45089"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.67406+00	2026-04-27 17:41:43.67406+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
03cf7d40-3dcf-4f86-8566-2070219ac5d4	AST-00041	9016120c-a281-46ff-8e49-81f059ed164b	\N	B560M PRO-E (MS-7D22)	N/A-012	\N	{"hdd_(gb)": "1 TB", "ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "256", "hdd_model": "ST1000VM002-1SD102", "mac_(lan)": "04-7C-16-76-3F-FA", "processor": "I5", "ssd_model": "Simm s930P PRO", "generation": "10th", "ram_frequency": "2667", "hdd_serial_number": "Z9CAQEXW", "ssd_serial_number": "AA000000000000000920", "system_assign_date": "17-Aug-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.681133+00	2026-04-27 17:41:43.681133+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a7fdd538-556f-48bb-9851-352dc3f3dc88	AST-00042	60b7adf3-53cc-4aa9-9418-c6ddf6e860bc	f8a9bd5c-c535-434c-b936-2f97e420b233	Hp Wireless Keyboard	7CH3342QL0	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.689236+00	2026-04-27 17:41:43.689236+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
63cc972c-8cbc-4606-89fb-008313abf5ee	AST-00043	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Elitebook 840G3	N/A-5CG6322XWZ	\N	{"hdd_(gb)": "500", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "256", "hdd_model": "160902RB250AAS0GVXMK", "mac_(lan)": "98-E7-F4-32-5E-63", "processor": "I5", "ssd_model": "AA000000000000001355", "generation": "6th", "mac_(wifi)": "E4-A4-71-DE-CA-24", "ram_frequency": "2133", "hdd_serial_number": "500105249280", "ssd_serial_number": "256052966400"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.696819+00	2026-04-27 17:41:43.696819+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
51551950-e506-4c07-8afc-224bb58107e4	AST-00044	9016120c-a281-46ff-8e49-81f059ed164b	\N	Z370M D3H-CF	N/A-013	\N	{"hdd_(gb)": "1 TB", "ram_(gb)": "40", "ram_type": "DDR4", "ssd_(gb)": "512", "hdd_model": "WDC WD10EZEX-00MFCA0", "mac_(lan)": "E0-D5-5E-B8-AA-34", "processor": "I7", "ssd_model": "SATA3 SSD", "generation": "8th", "mac_(wifi)": "E0-D5-5E-B8-AA-34", "mobile_number": "yes", "ram_frequency": "2133", "google_profile": "yes", "hdd_serial_number": "WD- WCC6Y3XNHK90", "ssd_serial_number": "2022100903025", "screen_serial_number": "WEH224720001 & 32'"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.704768+00	2026-04-27 17:41:43.704768+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
3ef3a699-afd0-4ce1-8235-c58e3a7836d4	AST-00045	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Hp wireless Mouse	N/A-7CH2462YVL	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.712019+00	2026-04-27 17:41:43.712019+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
933ccedb-4540-49d6-96b0-3f7bedbbe9d8	AST-00046	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	\N	2234350000423	N/A-014	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.717684+00	2026-04-27 17:41:43.717684+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
c90e4969-0b48-4653-9921-d06cfe26e2f6	AST-00047	9016120c-a281-46ff-8e49-81f059ed164b	\N	H110M-H-CF	N/A-015	\N	{"hdd_(gb)": "500", "ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "128", "hdd_model": "ST500DM002- 1BD142", "mac_(lan)": "E0-D5-5E-7D-F0-8D", "processor": "I5", "ssd_model": "KINGFAST", "generation": "6th", "mobile_number": "yes", "ram_frequency": "2133", "google_profile": "yes", "hdd_serial_number": "Z6E8LNK0", "ssd_serial_number": "AA000000000000005764", "screen_serial_number": "208NTVSCY527 & 32'"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.725633+00	2026-04-27 17:41:43.725633+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
8ae52916-5d92-4900-89ff-19da32450d3a	AST-00048	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	\N	222C9E5009958	N/A-016	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.732461+00	2026-04-27 17:41:43.732461+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
0c49735f-429c-4f5d-95f7-f14b11c4cf84	AST-00049	9016120c-a281-46ff-8e49-81f059ed164b	\N	B85M-D3V-A	N/A-017	\N	{"hdd_(gb)": "500", "ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "256", "hdd_model": "CT3500SC", "mac_(lan)": "1C-1B-0D-8C-6F-33", "processor": "I5", "ssd_model": "SSD", "generation": "4th", "mobile_number": "yes", "ram_frequency": "1600", "google_profile": "yes", "hdd_serial_number": "CTB5004A22X5977", "ssd_serial_number": "AA20220924094"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.740041+00	2026-04-27 17:41:43.740041+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
6d489933-36ba-4ccc-b06c-221c62fd966c	AST-00050	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	\N	222C9E5009962	N/A-018	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.747203+00	2026-04-27 17:41:43.747203+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
10d79a90-9ab5-4d8b-9c2d-22f43631a19a	AST-00051	9016120c-a281-46ff-8e49-81f059ed164b	\N	PRIME H310M-CS R2.0	N/A-019	\N	{"hdd_(gb)": "1 TB", "ram_(gb)": "32", "ram_type": "DDR4", "ssd_(gb)": "240", "hdd_model": "TOSHIBA DT01ACA100", "mac_(lan)": "3C-7C-3F-11-15-45", "processor": "I7", "ssd_model": "CT240BX500SSD1", "generation": "9th", "mac_(wifi)": "48-22-54-2D-5F-B9", "mobile_number": "yes", "ram_frequency": "2133", "hdd_serial_number": "28A815GMS", "ssd_serial_number": "2152E5F7CADA", "screen_serial_number": "WEH224720025 & 32'"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.754986+00	2026-04-27 17:41:43.754986+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
f1764a8d-9812-466b-a17b-c86e441b6247	AST-00052	fede23b4-7e3b-467a-9b9f-f00e8d4dc4d9	\N	222C9E5009454	N/A-020	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.760925+00	2026-04-27 17:41:43.760925+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
654e643d-542e-4b7e-b94a-f99b7c07438d	AST-00053	e2d0052a-3ea6-4454-8b34-e7f29a1577da	4622ab5c-29be-4b12-ad42-8204f7582c1a	ASUS TUF GAMING F15 FX506HE_FX506HE	R7NRCX08K41731E	\N	{"ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "1TB", "mac_(lan)": "E8-9C-25-1E-6C-DD", "processor": "I7", "ssd_model": "NVMe WD PC SN560 SDDPNQE-1T00-1002", "generation": "11th", "mac_(wifi)": "F8-54-F6-22-D0-F3", "ram_frequency": "3200", "ssd_serial_number": "E823_8FA6_BF53_0001_001B_4488_4A88_529F.", "system_assign_date": "16-Oct-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.770841+00	2026-04-27 17:41:43.770841+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
5d7bcd6f-7379-494e-b06a-b45a0ed2a4ff	AST-00054	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Hp Wieless Mouse	7CH2462YVL	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.777886+00	2026-04-27 17:41:43.777886+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
f3e34b2d-2f29-4a6c-859e-b47a3bb7aa2d	AST-00055	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 7290	2C1Q0X2	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "Simm S970P PRO NVMe 512GB", "generation": "8th", "mac_(wifi)": "58-A0-23-8E-BA-F2", "mobile_number": "yes", "ram_frequency": "2400", "ssd_serial_number": "202305150615", "system_assign_date": "22-Jun-2024"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.786629+00	2026-04-27 17:41:43.786629+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
6551849d-09bb-4a9d-98d8-055c731d70be	AST-00056	e2d0052a-3ea6-4454-8b34-e7f29a1577da	4b5a4d44-d0c1-4624-a63f-38639eb8c097	Thinkpad L440	R90AGN85	\N	{"hdd_(gb)": "500", "ram_(gb)": "8", "ram_type": "DDR3", "hdd_model": "ST500LT012-1DG142", "mac_(lan)": "54-EE-75-2F-2D-4A", "processor": "I5", "generation": "4th", "mac_(wifi)": "E8-B1-FC-0A-5C-53", "mobile_number": "yes", "ram_frequency": "1600", "google_profile": "yes", "hdd_serial_number": "S3PH4L5S"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.793219+00	2026-04-27 17:41:43.793219+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
4c260f2b-30cd-45e7-8dc6-9e55745d5e79	AST-00060	8815099e-5883-4bd7-82e1-7f8a56673c1c	566bd7d8-d23c-4f95-988f-afc04f73bdf9	Wireless Mouse	2345AP0665M8	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.824298+00	2026-04-27 17:41:43.824298+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
e9bfa722-2e74-46d2-8c90-cd116d32cc88	AST-00061	e2d0052a-3ea6-4454-8b34-e7f29a1577da	4b5a4d44-d0c1-4624-a63f-38639eb8c097	V14	PF29C5SJ	\N	{"erp": "8448499074", "hdd_(gb)": "1 TB", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "128", "hdd_model": "ST1000LM049-2GH172", "mac_(lan)": "80-30-49-5B-B3-4E", "processor": "I5", "ssd_model": "SIMMTRONICS M2 2280", "generation": "10th", "mac_(wifi)": "80-30-49-5B-B3-4D", "mobile_number": "yes", "ram_frequency": "2667", "hdd_serial_number": "WN91JZSG", "ssd_serial_number": "AA00009510003355422", "system_assign_date": "14-Sep-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.833209+00	2026-04-27 17:41:43.833209+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
4fe9b66d-383b-47d9-b2fa-34f4859b957c	AST-00062	8815099e-5883-4bd7-82e1-7f8a56673c1c	f8a9bd5c-c535-434c-b936-2f97e420b233	Wireless Mouse	7CH2462YVN	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.841568+00	2026-04-27 17:41:43.841568+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
f3d72b26-f9a1-4672-800a-d02119ec62e9	AST-00063	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 3440	DH11Z44	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I3", "ssd_model": "P0221 NVMe Phison 512", "generation": "12th", "mac_(wifi)": "A8-59-5F-11-D2-F3", "mobile_number": "yes", "ram_frequency": "3200", "ssd_serial_number": "6479_A78F_9A90_1DC2", "system_assign_date": "10-Feb-2025"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.851003+00	2026-04-27 17:41:43.851003+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
614fd419-7916-4bb3-a81b-3c2368b697d7	AST-00064	8815099e-5883-4bd7-82e1-7f8a56673c1c	566bd7d8-d23c-4f95-988f-afc04f73bdf9	wireless	2345AP06D478	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.857314+00	2026-04-27 17:41:43.857314+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
15e14696-ff31-4654-8d9a-d67f6e3181c3	AST-00065	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 7290	1H2C1X2	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "Simm S970P PRO NVMe", "generation": "8th", "mac_(wifi)": "58-A0-23-10_87-E0", "ram_frequency": "2400", "ssd_serial_number": "6479_A762_5090_0037"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.86604+00	2026-04-27 17:41:43.86604+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
826dc9e9-17b2-46fa-a97e-0bbc3ef5b4d2	AST-00066	9016120c-a281-46ff-8e49-81f059ed164b	\N	H81M-CS	N/A-022	\N	{"hdd_(gb)": "500", "ram_(gb)": "12", "ram_type": "DDR3", "ssd_(gb)": "128", "hdd_model": "TOSHIBA DT01ACA050", "mac_(lan)": "D0-00-6A-13-06-79", "processor": "intel Pentium", "ssd_model": "SSD", "generation": "G3220", "mac_(wifi)": "9C-5C-8E-91-48-2B", "ram_frequency": "1400", "hdd_serial_number": "662J5ZEBS", "ssd_serial_number": "YS20201002571", "system_assign_date": "03-Aug-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.871925+00	2026-04-27 17:41:43.871925+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
b7295a08-171e-4325-a5a8-447813703223	AST-00067	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 7280	2T8R3M2	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "1TB", "mac_(lan)": "A4-4C-C8-80-DF-E5", "processor": "I5", "ssd_model": "CONSISTENT NVME S6", "generation": "7th", "mac_(wifi)": "E4-70-B8-7D-26-52", "mobile_number": "yes", "ram_frequency": "2400", "google_profile": "yes", "ssd_serial_number": "0000_0000_0000_0000_00E0_4C16_7829_606D.", "system_assign_date": "15-Jul-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.880475+00	2026-04-27 17:41:43.880475+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
7bc90958-b4ec-47a8-b2cd-43c8a45e1a5f	AST-00068	8815099e-5883-4bd7-82e1-7f8a56673c1c	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Wireless Mouse	N/A-023	\N	{}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.887087+00	2026-04-27 17:41:43.887087+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
b250d0f5-0cd9-4e8b-9e02-6af7ca77ce7c	AST-00069	e2d0052a-3ea6-4454-8b34-e7f29a1577da	\N	\N	N/A-024	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "1TB", "processor": "I5", "ssd_model": "CONSISTENT NVME S6", "generation": "7th", "ram_frequency": "2400"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.89477+00	2026-04-27 17:41:43.89477+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
0abb8b00-a9e4-4fd3-a3d4-8f56c48c0caf	AST-00070	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Pavilion x360	8CG0095FXW	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "256", "processor": "I5", "ssd_model": "WDC PC SN520 SDAPNUW-256G-1006", "generation": "10th", "mac_(wifi)": "E8-6F-38-63-7F-8D", "mobile_number": "yes", "ram_frequency": "2667", "google_profile": "yes", "ssd_serial_number": "E823_8FA6_BF53_0001_001B_448B_4663_31E1", "system_assign_date": "08-Jun-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.901271+00	2026-04-27 17:41:43.901271+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a6825968-96b6-410b-bfe9-513256291d49	AST-00071	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 7280	2BD44FF7	\N	{"ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "Geonix Supersonic", "generation": "7th", "mac_(wifi)": "34-41-5d-53-39-3C", "mobile_number": "yes", "ram_frequency": "2400", "google_profile": "yes", "ssd_serial_number": "UB202309150000002446"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.910625+00	2026-04-27 17:41:43.910625+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a0f6a0e9-270c-4929-9747-f2b9829bda02	AST-00072	9016120c-a281-46ff-8e49-81f059ed164b	\N	G41	N/A-025	\N	{"hdd_(gb)": "500", "ram_(gb)": "4", "ram_type": "DDR3", "hdd_model": "ST3500312CS", "mac_(lan)": "00-E0-4C-08-92-81", "processor": "Dual Core", "generation": "E5300", "mobile_number": "yes", "google_profile": "yes", "hdd_serial_number": "5VVVYS0T"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.916744+00	2026-04-27 17:41:43.916744+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
4a8f9463-4696-44e1-a501-c37e49ebeceb	AST-00073	9016120c-a281-46ff-8e49-81f059ed164b	\N	07C09D	N/A-026	\N	{"hdd_(gb)": "500", "ram_(gb)": "4", "ram_type": "DDR3", "ssd_(gb)": "120", "hdd_model": "ST3500312CS", "mac_(lan)": "00-E0-4C-10-46-8D", "processor": "I5", "ssd_model": "ADATA SU650", "generation": "3rd", "mac_(wifi)": "50-2B-73-A9-0A-B4", "google_profile": "yes", "hdd_serial_number": "5VVSN9EA", "ssd_serial_number": "2K4429ABQQDL", "system_assign_date": "03-Aug-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.924216+00	2026-04-27 17:41:43.924216+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
c35969f5-a49e-4681-931e-2cb29d56b0b7	AST-00074	9016120c-a281-46ff-8e49-81f059ed164b	\N	G41	N/A-027	\N	{"hdd_(gb)": "500", "ram_(gb)": "4", "ram_type": "DDR2", "ssd_(gb)": "120", "hdd_model": "ST500DM002-1BD142", "mac_(lan)": "00-E0-4C-1D-1B-EA", "processor": "Core2Duo", "ssd_model": "ADATA SU650", "generation": "E7400", "mobile_number": "yes", "google_profile": "yes", "hdd_serial_number": "Z6E0MSP0", "ssd_serial_number": "2K4429AH2EW2"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.930803+00	2026-04-27 17:41:43.930803+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
be384b0d-ce35-450b-972e-ec68875679f6	AST-00075	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	\N	N/A-028	\N	{"ram_(gb)": "DDR4", "ssd_(gb)": "500", "processor": "I5", "generation": "7th", "ram_frequency": "2400"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.939071+00	2026-04-27 17:41:43.939071+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
27a4dccd-a947-4408-ad51-a2436d362e38	AST-00076	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude E6440	9CMJ622	\N	{"hdd_(gb)": "500", "ram_(gb)": "4", "ram_type": "DDR3", "ssd_(gb)": "120", "hdd_model": "TOSHIBA MQ01ABD050V -63", "mac_(lan)": "34-E6-D7-02-0A-97", "processor": "I5", "ssd_model": "GAMER L TA1D0120A", "generation": "4th", "mac_(wifi)": "4C-BB-58-66-3F-90", "ram_frequency": "1333", "google_profile": "yes", "hdd_serial_number": "66PIP7HVT", "ssd_serial_number": "C9B00794150200001938", "system_assign_date": "03-Jan-2024"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.947194+00	2026-04-27 17:41:43.947194+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
2de7b168-081d-4c45-a497-0e69b6852f7f	AST-00077	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Probook 440 G9	5CD302G3XW	\N	{"ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "Samsung MZVL4512HBLU-00BH1", "generation": "12th", "mac_(wifi)": "A0-29-42-C2-FE-16", "ram_frequency": "3200", "ssd_serial_number": "0025_38EB_21BF_CE25"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.956776+00	2026-04-27 17:41:43.956776+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a9edce28-ab93-46c5-beb0-ed1f0c071728	AST-00078	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Probook 6470b	5CG6060JJ8	\N	{"ram_(gb)": "8", "ram_type": "DDR3", "ssd_(gb)": "128", "mac_(lan)": "2C-59-E5-03-35-F7", "processor": "I5", "ssd_model": "SANDISK BICS", "generation": "5th", "mac_(wifi)": "9A-42-DD-B9-34-4E", "ram_frequency": "1600", "google_profile": "yes", "ssd_serial_number": "AA000000000000002697", "system_assign_date": "27-May-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.964477+00	2026-04-27 17:41:43.964477+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
a3784996-4016-45f7-a2ab-661e0808b4ac	AST-00079	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Probook 6470b	CNU2509WV3	\N	{"hdd_(gb)": "320", "ram_(gb)": "12", "ram_type": "DDR3", "ssd_(gb)": "128", "hdd_model": "WDC WD3200BEKT-75PVMT1", "mac_(lan)": "38-EA-A7-88-5D-28", "processor": "I5", "ssd_model": "SSD", "generation": "3rd", "mac_(wifi)": "60-67-20-CA-32-CA", "ram_frequency": "1600", "google_profile": "yes", "hdd_serial_number": "WD-WX61C1255064", "ssd_serial_number": "YS20201002581", "system_assign_date": "27-May-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.973853+00	2026-04-27 17:41:43.973853+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
08b27404-425e-4535-a80b-37242577ce98	AST-00081	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Probook 6470b	CNU3269JYG	\N	{"hdd_(gb)": "320", "ram_(gb)": "16", "ram_type": "DDR3", "ssd_(gb)": "256", "hdd_model": "TOSHIBA MK3276GSX", "mac_(lan)": "6C-88-14-78-E9-C0", "processor": "I5", "ssd_model": "SPCC SSD", "generation": "3rd", "mac_(wifi)": "6C-88-14-78-E9-C0", "ram_frequency": "1333", "hdd_serial_number": "135HC2J1T", "ssd_serial_number": "AA000000000000004700", "system_assign_date": "03-Sep-2023"}	assigned	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.991799+00	2026-04-28 08:16:02.885848+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
275590b7-be5b-40c6-b4a0-c84f594d6445	AST-00082	e2d0052a-3ea6-4454-8b34-e7f29a1577da	\N	Latitude E6430	7MHQSY1	\N	{"hdd_(gb)": "320", "ram_(gb)": "8", "ram_type": "DDR3", "ssd_(gb)": "120", "hdd_model": "HGST HTS545032A7E380", "mac_(lan)": "F0-1F-AF-47-B4-6D", "processor": "I5", "ssd_model": "ADATA SU650", "generation": "3rd", "mac_(wifi)": "4C-BB-58-4D-5E-E5", "ram_frequency": "1333", "google_profile": "yes", "hdd_serial_number": "TW8413L407A8ZN", "ssd_serial_number": "2K4429ABC51P", "system_assign_date": "26-May-2023"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.998265+00	2026-04-28 18:57:30.925244+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
35a329a9-cbb1-4a33-b539-a5612c18fbe5	AST-00085	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude E6440	GRHNF12	\N	{"hdd_(gb)": "500", "ram_(gb)": "4", "ram_type": "DDR3", "ssd_(gb)": "120", "hdd_model": "TOSHIBA MQ01ABF050", "processor": "I5", "ssd_model": "ADATA SU650", "generation": "4th", "mac_(wifi)": "C4-D9-87-C6-D8-2E", "mobile_number": "Yes", "ram_frequency": "1600", "hdd_serial_number": "28S0T9JDT", "ssd_serial_number": "2K442L1B2APW"}	assigned	\N	\N	{"notes": "Lorem"}	f	\N	\N	2026-04-27 17:41:44.024391+00	2026-04-27 19:33:09.813931+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
1368ac5e-36f2-4fec-97d2-9523d39191ca	AST-00084	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	\N	N/A-029	\N	{"hdd_(gb)": "320", "ram_(gb)": "8", "ram_type": "DDR3", "ssd_(gb)": "120", "processor": "I5", "generation": "3rd"}	assigned	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:44.016461+00	2026-04-27 19:33:27.120613+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	AST-00083	8815099e-5883-4bd7-82e1-7f8a56673c1c	566bd7d8-d23c-4f95-988f-afc04f73bdf9	wireless mouse	2238LZD2CFP8	4da76a93-03eb-493e-aa76-1038a694cc45	{"wifi": "10.02.93.03"}	assigned	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:44.00786+00	2026-04-27 19:39:48.834081+00	\N	4bf322c0-7045-4a3a-8206-0723bfe24b94	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
8226c4da-3deb-4504-8617-5f0338a26cf5	AST-00007	e2d0052a-3ea6-4454-8b34-e7f29a1577da	dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Latitude 5480	GZKJLH2	\N	{"erp": "yes", "ram_(gb)": "16", "ram_type": "DDR4", "ssd_(gb)": "512", "processor": "I5", "ssd_model": "EVM SSD", "generation": "7th", "mac_(wifi)": "F4-96-34-C7-54-CA", "mobile_number": "9910398011", "ram_frequency": "2400", "google_profile": "yes", "ssd_serial_number": "AA000000000000003209", "system_assign_date": "2023-10-06 00:00:00"}	lost	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.36952+00	2026-04-27 21:07:49.156384+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
229cb8a0-bede-408e-bd5f-25b3451a2b02	AST-00080	e2d0052a-3ea6-4454-8b34-e7f29a1577da	4b5a4d44-d0c1-4624-a63f-38639eb8c097	Thinkpad T440	PC02UBTP	\N	{"hdd_(gb)": "320", "ram_(gb)": "4", "ram_type": "DDR3", "hdd_model": "ST320LT007-9ZV142", "mac_(lan)": "5C-C5-D4-03-34-A4", "processor": "I5", "generation": "4th", "mac_(wifi)": "50-2B-73-AC-45-85", "mobile_number": "yes", "ram_frequency": "1600", "google_profile": "yes", "hdd_serial_number": "W0Q7WCTV"}	in_stock	\N	\N	{"source": "bulk_import", "category_mode": "predefined", "template_version": 5}	f	\N	\N	2026-04-27 17:41:43.983228+00	2026-04-28 07:15:21.158325+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
f24f2b61-a523-47c9-8460-ea95b8715c25	AST-00059	e2d0052a-3ea6-4454-8b34-e7f29a1577da	f8a9bd5c-c535-434c-b936-2f97e420b233	Elitebook 840 G3	5CG6322XWZ	\N	{"hdd_(gb)": "320", "ram_(gb)": "8", "ram_type": "DDR4", "ssd_(gb)": "256", "hdd_model": "ST9320423AS", "processor": "I5", "ssd_model": "SSD", "generation": "6th", "mac_(wifi)": "E4-A4-71-DE-CA-24", "ram_frequency": "2133", "hdd_serial_number": "5VH6FXKL", "ssd_serial_number": "AA000000000000001355", "system_assign_date": "12-01-2024", "sim_previously_used_by": "45309"}	assigned	\N	\N	{"notes": "test"}	f	\N	\N	2026-04-27 17:41:43.816506+00	2026-04-29 20:02:35.174025+00	\N	\N	\N	9ab281f1-c379-4f58-9156-d0c65da75e99
\.


--
-- Data for Name: custom_field_definitions; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.custom_field_definitions (id, category_id, field_key, label, data_type, is_required, options, sort_order, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.departments (id, name, created_at, updated_at) FROM stdin;
29077b5b-ca9b-4222-b563-10b538564a1e	IT	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
da305235-4ae4-4685-8d73-54fcc5af7cc6	HR	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
f0225162-689c-4a2a-9931-bfccfe580ddc	Finance	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
b01948ec-dfc2-423b-85b5-604a375318af	Engineering	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
d83299da-318b-4634-a4bb-4c0a1e6112c0	Operations	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
0404e0da-ed9a-4753-96a0-e7a3d1cb35ca	Sales	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
f6784762-cb54-4606-8596-38fcda9e4a70	Marketing	2026-04-24 10:14:28.14416+00	2026-04-24 10:14:28.14416+00
65d075c8-42ec-476a-83a9-6dc2e02d527e	SOFTWARE	2026-04-25 18:48:56.850232+00	2026-04-25 18:48:56.850232+00
38e75b31-4b71-40d2-813f-5a02ceefbc7c	R&D (CHEMICAL)	2026-04-25 20:01:49.280175+00	2026-04-25 20:01:49.280175+00
957c9581-d276-4f39-ba9b-23222efe9764	BRANDING & PROMOTION	2026-04-27 06:39:59.746562+00	2026-04-27 06:39:59.746562+00
d029abe1-a48b-4b58-aa7b-73b06e1a998c	QUALITY	2026-04-27 06:39:59.76376+00	2026-04-27 06:39:59.76376+00
3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	R&D	2026-04-27 06:39:59.802072+00	2026-04-27 06:39:59.802072+00
ccbd12ac-056a-4c0b-9a44-097c9f8b006a	R&D (EL)	2026-04-27 06:39:59.928304+00	2026-04-27 06:39:59.928304+00
d2cb82bf-c03b-4422-aa89-6b86a880e2b9	R&D (M)	2026-04-27 06:39:59.943355+00	2026-04-27 06:39:59.943355+00
a1ae228f-ad2c-44e7-a18c-e0582a56822e	R&D (P)	2026-04-27 06:39:59.952864+00	2026-04-27 06:39:59.952864+00
ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	SALES & MARKETING	2026-04-27 06:39:59.961666+00	2026-04-27 06:39:59.961666+00
4487c098-993f-448b-8b0d-d182a7d6f381	SMART METER DIVISION	2026-04-27 06:40:00.076474+00	2026-04-27 06:40:00.076474+00
cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	TECHICAL SUPPORT	2026-04-27 06:40:00.081999+00	2026-04-27 06:40:00.081999+00
5132f2a7-1047-4be6-a1e1-cee616217f21	TENDER	2026-04-27 06:40:00.135688+00	2026-04-27 06:40:00.135688+00
e8eef3e6-c5e3-4fd7-8a14-f5f11977a88c	TELECOM	2026-04-27 06:40:00.166351+00	2026-04-27 06:40:00.166351+00
dfd1e168-4be6-40e0-9ae2-4c33a2fe20f0	DISPATCH & LOGISTICS	2026-04-27 06:40:00.179596+00	2026-04-27 06:40:00.179596+00
25fe3189-7737-4097-80a3-043fc0c5a47a	STORE	2026-04-27 06:40:00.18653+00	2026-04-27 06:40:00.18653+00
7d259614-5d14-4e0a-9582-843fa70986b2	PRODUCTION	2026-04-27 06:40:00.192281+00	2026-04-27 06:40:00.192281+00
803a8c85-9439-46a1-a176-52bd6c485d07	ERP	2026-04-27 06:40:00.197643+00	2026-04-27 06:40:00.197643+00
80612130-c9e0-4173-b663-e86091bf3ebc	HR & ADMIN	2026-04-27 06:40:00.218596+00	2026-04-27 06:40:00.218596+00
35d079bc-5e57-428d-a968-a2dd8d5fae2e	MANAGEMENT	2026-04-27 06:40:00.253341+00	2026-04-27 06:40:00.253341+00
c030e892-58b2-4d44-8545-990b35543565	PURCHASE	2026-04-27 06:40:00.272974+00	2026-04-27 06:40:00.272974+00
7943c35d-d2d9-4a3b-90ee-6b23871f103e	ACCOUNTS	2026-04-27 06:40:00.294815+00	2026-04-27 06:40:00.294815+00
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.employees (id, employee_id, name, email, department_id, auth_user_id, role, is_active, erp_active, metadata, created_at, updated_at, is_deleted) FROM stdin;
9ab281f1-c379-4f58-9156-d0c65da75e99	JMV10728	Bikash Prasad Barnwal	bikash@jmv.co.in	65d075c8-42ec-476a-83a9-6dc2e02d527e	369217581027950595	admin	t	t	{}	2026-04-25 17:49:48.234948+00	2026-04-25 18:48:56.876894+00	f
01654d05-d9fc-4ff1-848c-ff339ae59d90	J1252	DEEPALI CHAUHAN	deepali@jmv.co.in	957c9581-d276-4f39-ba9b-23222efe9764	\N	employee	t	t	{}	2026-04-27 06:39:59.750047+00	2026-04-27 06:39:59.750047+00	f
cf0e641b-1895-4447-bafd-eecad0aa8942	JMV10607	VISHAL BHAGAT	vishalkumar@jmv.co.in	957c9581-d276-4f39-ba9b-23222efe9764	\N	employee	t	t	{}	2026-04-27 06:39:59.757649+00	2026-04-27 06:39:59.757649+00	f
f9f30d8a-20b3-4f7d-8d1d-62034c77c317	J1247	RAKHI KUMARI	rakhi@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.765226+00	2026-04-27 06:39:59.765226+00	f
f3d1619a-0230-4ee4-a0e4-eee552407466	J1294	SUDHIR KUMAR	sudhir@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.769586+00	2026-04-27 06:39:59.769586+00	f
9c0d8fda-8f0a-4e68-9eee-28db5d08314a	J1306	AMIT KUMAR	amit.kumar@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.7751+00	2026-04-27 06:39:59.7751+00	f
6332d9a6-7ee6-4db8-97f2-dbb13d3394fd	J1315	SUDHA RANI	sudha@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.780816+00	2026-04-27 06:39:59.780816+00	f
17bb1a8b-abb4-4199-82a8-25dbe6ac301d	JMV10385	NARENDER KUMAR	narendra@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.784827+00	2026-04-27 06:39:59.784827+00	f
c782101c-9b85-4ee8-b740-35586523c8f2	JMV10588	NIKHIL PAL	nikhilpal@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.788872+00	2026-04-27 06:39:59.788872+00	f
63d6602d-e129-4421-ac89-be7a9e3f7dc7	JMV10591	KUSHAL VEER SINGH	kushal@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.794267+00	2026-04-27 06:39:59.794267+00	f
a1752611-c458-4a83-afe5-4f5fd8365230	JMV10692	PRAGATI GUPTA	pragati@jmv.co.in	d029abe1-a48b-4b58-aa7b-73b06e1a998c	\N	employee	t	t	{}	2026-04-27 06:39:59.798334+00	2026-04-27 06:39:59.798334+00	f
44012db7-870f-4cb6-a00f-f2fb6464ae40	J1217	SUSHANT KUMAR BADAL	sushant@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.803737+00	2026-04-27 06:39:59.803737+00	f
f669fcfb-6804-498a-ab1b-2199dcb5dc38	J1228	ABHAY SRIVASTAV	abhay@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.807901+00	2026-04-27 06:39:59.807901+00	f
9a370cd1-8cdc-440e-8647-8192890b42d0	J1245	ADITYA KUMAR	adityakumar@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.813259+00	2026-04-27 06:39:59.813259+00	f
1f4b86b9-1c9b-4bd6-b866-b4fee45361de	J1250	PRIYA DAKSHA	priyadaksha@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.817008+00	2026-04-27 06:39:59.817008+00	f
8b683e08-68ee-4727-ac74-79326bedee55	J1251	ASHEESH YADAV	asheesh@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.821181+00	2026-04-27 06:39:59.821181+00	f
9b891397-2d35-44c3-962a-71091ebb5c9d	J1267	SHEKHAR TYAGI	shekhar.tyagi@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.825363+00	2026-04-27 06:39:59.825363+00	f
13f9269c-c201-4905-a781-19f0fae129c5	J1270	NEHA	nehaprajapati@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.831334+00	2026-04-27 06:39:59.831334+00	f
2df50a6f-9246-4e94-a757-77856ca598d7	J1279	PRAVEEN KUMAR	praveenkumar@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.835974+00	2026-04-27 06:39:59.835974+00	f
22a4d550-edb7-4c67-b679-a647c13a306d	JMV10013	LALIT JOSHI	lalit@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.840014+00	2026-04-27 06:39:59.840014+00	f
2da6a801-b7ef-4217-a230-e9079c0c507c	JMV10501	KULDEEP GUPTA	kuldeepgupta@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.844575+00	2026-04-27 06:39:59.844575+00	f
7f18e821-cbb4-4083-8072-b7c5310f7308	JMV10503	PRIYANKA JAMWAL	priyankajamwal@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.849387+00	2026-04-27 06:39:59.849387+00	f
7fb239f0-d556-4667-8d23-a782759cec5a	JMV10504	RAHUL JOSHI	rahul.joshi@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.85311+00	2026-04-27 06:39:59.85311+00	f
c501ac5d-4c44-4184-b971-f17cd2e89759	JMV10556	VIBHOR KUMAR RAJPUT	vibhor@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.857013+00	2026-04-27 06:39:59.857013+00	f
ce3ef4b7-6919-4306-b0c2-19fb7746ebb5	JMV10579	ABHISHEK CHAUHAN	abhishekchauhan@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.860781+00	2026-04-27 06:39:59.860781+00	f
e735e1b3-f3d5-4d4e-8335-5bba6a132838	JMV10581	MD. WAQUAR HASSAN	waqar@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.865164+00	2026-04-27 06:39:59.865164+00	f
720318ac-2ab0-4ade-8b9b-346cacb9d639	JMV10595	DEENDYAL UPADHYAY	deendyal@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.868952+00	2026-04-27 06:39:59.868952+00	f
5e580bad-9ac1-40eb-b280-565092e1681a	JMV10616	SHAKHER KUMAR	shekhar@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.872965+00	2026-04-27 06:39:59.872965+00	f
c97b111b-91a3-4711-a291-a46bbc7dd1a1	JMV10621	UTKARSH SINGH	utkarsh@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.877+00	2026-04-27 06:39:59.877+00	f
c4fdc858-e47c-4d95-a263-4155128f2472	JMV10657	CHANDAN KUMAR	chandan@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.880996+00	2026-04-27 06:39:59.880996+00	f
7f2d6aa3-99bd-4899-8c40-666b791b076c	JMV10680	SAGAR KUMAR JHA	skjha@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.884616+00	2026-04-27 06:39:59.884616+00	f
448a51af-1539-41cc-919c-e902da9650e7	JMV10681	RAJAN KUMAR	rajan@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.888613+00	2026-04-27 06:39:59.888613+00	f
619d43fe-aaa7-47fe-b778-bec3302ddaeb	JMV10685	DHULIPALLA SAI SILPA	dhulipalla@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.892689+00	2026-04-27 06:39:59.892689+00	f
457af9fa-49bc-4684-a24c-064d32617cb0	JMV10687	SONAM SHARMA	sonamsharma@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.896576+00	2026-04-27 06:39:59.896576+00	f
5699f917-e60f-4e25-8089-6fe6eec3920f	JMV10693	SHUBHAM SHARMA	ssharma@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.900417+00	2026-04-27 06:39:59.900417+00	f
84c68ec0-a6ac-44f4-90e9-1c3be7a9f584	JMV10711	SHUBHAM SHUKLA	shubhamshukla@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.904661+00	2026-04-27 06:39:59.904661+00	f
6c27a2f9-c6bc-4f27-b122-36c634594880	JMV10715	AMAN PATEL	amanpatel@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.908583+00	2026-04-27 06:39:59.908583+00	f
9bf17900-0d3b-4efb-aab3-577c4fdad023	JMV10717	DHANANJAY SINGH	d.singh@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.912834+00	2026-04-27 06:39:59.912834+00	f
4fe3189d-4fcf-4ef2-9485-07fb9455f982	JMV10723	SUMIT SHARMA	sumitsharma@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.916395+00	2026-04-27 06:39:59.916395+00	f
339bd3a1-0199-4f15-921b-14b481175883	JMV10724	SACHIN SHARMA	sachinsharma@jmv.co.in	3a8c9bba-9a8d-42c9-a2b1-8a2cbe9122f8	\N	employee	t	t	{}	2026-04-27 06:39:59.920479+00	2026-04-27 06:39:59.920479+00	f
212b3000-3f01-4698-8429-477106630da2	JMV10020	NAND KISHOR	nandkishor@jmv.co.in	38e75b31-4b71-40d2-813f-5a02ceefbc7c	\N	employee	t	t	{}	2026-04-27 06:39:59.924478+00	2026-04-27 06:39:59.924478+00	f
98dcb5a1-abc1-42dc-a539-52eb3380d058	J1321	SAURABH SAHAY	saurabhsahay@jmv.co.in	ccbd12ac-056a-4c0b-9a44-097c9f8b006a	\N	employee	t	t	{}	2026-04-27 06:39:59.929483+00	2026-04-27 06:39:59.929483+00	f
080ae97c-3d19-4165-a1b6-50d9324fe559	JMV10094	SAURABH GUPTA	saurabh@jmv.co.in	ccbd12ac-056a-4c0b-9a44-097c9f8b006a	\N	employee	t	t	{}	2026-04-27 06:39:59.934737+00	2026-04-27 06:39:59.934737+00	f
39b9ad5e-57da-4a46-9ddf-d45f16552384	JMV10119	SURYANSHU KUSHWAHA	suryanshu@jmv.co.in	ccbd12ac-056a-4c0b-9a44-097c9f8b006a	\N	employee	t	t	{}	2026-04-27 06:39:59.938899+00	2026-04-27 06:39:59.938899+00	f
8efe6ee5-a5be-44b7-9fcb-5fc2c38b25b1	JMV10129	ANURAG PATHAK	anurag@jmv.co.in	d2cb82bf-c03b-4422-aa89-6b86a880e2b9	\N	employee	t	t	{}	2026-04-27 06:39:59.944921+00	2026-04-27 06:39:59.944921+00	f
ff120431-808c-4f13-9f9a-f3a2d61cc830	JMV10668	AMIT PAL	amit.pal@jmv.co.in	d2cb82bf-c03b-4422-aa89-6b86a880e2b9	\N	employee	t	t	{}	2026-04-27 06:39:59.948761+00	2026-04-27 06:39:59.948761+00	f
9c95445a-3e9d-4310-ba2e-6ace4534f173	J1308	SACHIN MAURYA	sachin.maurya@jmv.co.in	a1ae228f-ad2c-44e7-a18c-e0582a56822e	\N	employee	t	t	{}	2026-04-27 06:39:59.954548+00	2026-04-27 06:39:59.954548+00	f
fd5446ea-4ba6-4f76-87c7-5362173c2cde	JMV10131	SURAJ KUMAR PATHAK	suraj@jmv.co.in	a1ae228f-ad2c-44e7-a18c-e0582a56822e	\N	employee	t	t	{}	2026-04-27 06:39:59.958193+00	2026-04-27 06:39:59.958193+00	f
d56c0533-5e13-4667-8321-3eacbc6b8483	J1194	VANDANA	vandana@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.962824+00	2026-04-27 06:39:59.962824+00	f
3ee06c82-79b5-49cc-ad5c-d04caa29b02f	J1214	ANSHUMAN SINGH	anshuman@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.966275+00	2026-04-27 06:39:59.966275+00	f
04fed796-9e5b-4784-9761-09ed5533e829	J1234	NEHA GUPTA	neha@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.970956+00	2026-04-27 06:39:59.970956+00	f
efd33003-5691-4b2c-bfce-f10c154fc2d9	J1239	GUNJAN	gunjan@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.976438+00	2026-04-27 06:39:59.976438+00	f
9f6ce26f-d002-44b8-b9be-3ada4b2e76d8	J1246	SAKSHAM WALIA	saksham@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.981146+00	2026-04-27 06:39:59.981146+00	f
3d136060-c6b0-43ad-bd59-7396d1d442e5	J1261	TARUN KUMAR SHROTI	tarun@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.985747+00	2026-04-27 06:39:59.985747+00	f
685a636e-7c19-49d4-8622-0d61f869e656	J1301	SANJANA KUMARI	sanjana@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.991757+00	2026-04-27 06:39:59.991757+00	f
889533e3-7cb5-40dc-8c45-b82df40d5cc4	J1311	SHAKTI SHARMA	shakti@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:39:59.996707+00	2026-04-27 06:39:59.996707+00	f
e6edd709-5a87-4c5c-a7aa-090d63d4b15e	JMV10012	KULDEEP SINGH	kuldeep@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.001402+00	2026-04-27 06:40:00.001402+00	f
0475fcf3-2369-4942-82e9-5586687288a3	JMV10034	SMITHA SAJI	smitha@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.006085+00	2026-04-27 06:40:00.006085+00	f
4a35f649-3106-4f59-b413-ea877aa1b352	JMV10093	SHIVAM RAO	shivam.rao@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.01119+00	2026-04-27 06:40:00.01119+00	f
7f7bb219-b001-4356-bd14-a956a4b6b44c	JMV10122	AYUSH KUMAR YADAV	ayush@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.015881+00	2026-04-27 06:40:00.015881+00	f
e53b4461-6985-475b-a06e-630b508b91e4	JMV10327	RAHUL KUMAR	rahulkumar@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.021267+00	2026-04-27 06:40:00.021267+00	f
d9d572b6-c6f8-469a-9129-2bdcbf1ba94e	JMV10355	RAJEEV SHARMA	rajeev.sharma@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.029571+00	2026-04-27 06:40:00.029571+00	f
01ac7f39-9dfd-41aa-a731-89e928d35a56	JMV10421	SHAILESH PRAJAPATI	shailesh@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.035698+00	2026-04-27 06:40:00.035698+00	f
f11838c8-7ed8-45a8-af94-71544cf3295e	JMV10518	RADHA SHARMA	radha@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.040422+00	2026-04-27 06:40:00.040422+00	f
45460218-c9ab-4160-a3db-f101edb4ca1e	JMV10519	RAGHAVENDRA PRATAP SINGH	rp@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.045021+00	2026-04-27 06:40:00.045021+00	f
4531b817-aa6e-4901-a611-e2810e995b33	JMV10563	NAMRATA RANI	namrata@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.049205+00	2026-04-27 06:40:00.049205+00	f
1bb4e60c-0dbf-4873-b15f-70a8c129ee5e	JMV10564	PRAVEEN KUMAR RAI	praveen@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.053159+00	2026-04-27 06:40:00.053159+00	f
47045877-a106-413e-83d5-cc001a8401a4	JMV10669	SUDHANSHU	sudhanshugairola@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.057+00	2026-04-27 06:40:00.057+00	f
9ae9b434-9d40-4efa-92c5-b2bb935e5c48	JMV10682	RAMJI PANDEY	ramji@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.060768+00	2026-04-27 06:40:00.060768+00	f
edd24421-4947-4947-948e-a429f099eada	JMV10707	VIKAS NAGAR	vikasnagar@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.064581+00	2026-04-27 06:40:00.064581+00	f
df0eaea1-8ef2-4ba6-bb4a-8edd13b79cdd	JMV10718	POORVA SUDHIR	poorva@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.068552+00	2026-04-27 06:40:00.068552+00	f
7b8e0ca8-b709-40f2-9ee1-b514c4ddcf07	JMV10719	SEEMA BISWAS	seema.biswas@jmv.co.in	ec4b084d-65af-4ba8-bf5a-6b74b7a498dd	\N	employee	t	t	{}	2026-04-27 06:40:00.072805+00	2026-04-27 06:40:00.072805+00	f
d70007c8-e2c1-4d04-9197-86c5647ea648	JMV10727	VIMAL SHYAM	vimal@jmv.co.in	4487c098-993f-448b-8b0d-d182a7d6f381	\N	employee	t	t	{}	2026-04-27 06:40:00.077783+00	2026-04-27 06:40:00.077783+00	f
67a5e92d-3359-4f86-9d81-98e5f34f768b	J1264	BHUPENDRA  SINGH	bhupendra@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.083661+00	2026-04-27 06:40:00.083661+00	f
b06396a2-f9b0-4f17-8e4e-e3503805cfd1	J1266	SHIVANI GAUTAM	shivani.gautam@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.088438+00	2026-04-27 06:40:00.088438+00	f
4a32b384-6d5b-4b48-aa98-5ddc0bf6e901	J1282	VARSHA TIWARI	varsha@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.092962+00	2026-04-27 06:40:00.092962+00	f
1b37c1ad-7d7b-42b6-a296-a4060ef2f796	J1286	AMAN VERMA	amanverma@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.097127+00	2026-04-27 06:40:00.097127+00	f
a5f891d3-2033-416b-a6eb-8651b6d3336c	J1287	FARAZ AHMAD	faraz@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.101071+00	2026-04-27 06:40:00.101071+00	f
4803f276-4162-4246-aa1a-61b847ec18d8	JMV10006	AYUSHI AGARWAL	ayushi@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.105441+00	2026-04-27 06:40:00.105441+00	f
5fb645c1-1daa-49b9-a453-bff6a9b54600	JMV10021	NISHANT SAINI	nishant@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.109762+00	2026-04-27 06:40:00.109762+00	f
8b284b07-1259-41b0-a9f0-416a9888276c	JMV10497	VARUN CHAUDHARY	varun@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.113828+00	2026-04-27 06:40:00.113828+00	f
63af0895-2d8b-45e4-b8de-9594cfa80560	JMV10582	MOHD RASHID	rashid@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.117973+00	2026-04-27 06:40:00.117973+00	f
0512e422-0b6c-475b-9020-32c52c5d1998	JMV10586	PRITHVI RAJ	prithvi@jmv.co.in	cf6a75aa-3b24-4f0c-8a2a-e7dd2ac1b1f8	\N	employee	t	t	{}	2026-04-27 06:40:00.122195+00	2026-04-27 06:40:00.122195+00	f
76fb545d-4514-4f74-b26b-8f169133c99a	JMV10729	TARUNDEEP	tarundeep@jmv.co.in	65d075c8-42ec-476a-83a9-6dc2e02d527e	\N	employee	t	t	{}	2026-04-27 06:40:00.126591+00	2026-04-27 06:40:00.126591+00	f
04345345-b994-4311-9c82-18c01826f701	JMV10730	TUSHAR SHARMA	tusharsharma@jmv.co.in	65d075c8-42ec-476a-83a9-6dc2e02d527e	\N	employee	t	t	{}	2026-04-27 06:40:00.130808+00	2026-04-27 06:40:00.130808+00	f
349ba9a1-388a-4fff-bf9b-ed924c7c043c	J1265	NIKITA  MAURYA	nikita@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.137296+00	2026-04-27 06:40:00.137296+00	f
6d793281-251a-4021-b795-43d2cb3d6188	J1285	NISHA KUMARI	nisha@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.141102+00	2026-04-27 06:40:00.141102+00	f
97e43534-1620-41c2-b030-83a761264212	J1312	UTKARSH CHAUDHARY	utkarshchaudhary@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.145514+00	2026-04-27 06:40:00.145514+00	f
dcd808ab-d149-4b1c-afdd-31b7d814907a	JMV10025	PRIYANKA KUSHWAHA	priyanka@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.149698+00	2026-04-27 06:40:00.149698+00	f
566cfb6b-96cf-414b-9809-3f50b2b208ed	JMV10499	DEEPIKA SIJWALI	deepika@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.154213+00	2026-04-27 06:40:00.154213+00	f
8e8caf2a-054d-4263-831e-b7ed9b10401e	JMV10502	PRERNA PRAJAPATI	prerna@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.158201+00	2026-04-27 06:40:00.158201+00	f
dbe3f31c-7463-4498-8f48-be440c0c1136	JMV10618	KULDEEP PRAJAPATI	kuldeepprajapati@jmv.co.in	5132f2a7-1047-4be6-a1e1-cee616217f21	\N	employee	t	t	{}	2026-04-27 06:40:00.162518+00	2026-04-27 06:40:00.162518+00	f
5cd5862f-d3f1-4bde-a34b-61bd182a3cb4	J1271	PRADEEP KUMAR	pradeepkumar@jmv.co.in	e8eef3e6-c5e3-4fd7-8a14-f5f11977a88c	\N	employee	t	t	{}	2026-04-27 06:40:00.167708+00	2026-04-27 06:40:00.167708+00	f
100616d2-6477-458e-a252-ad976ffe229c	JMV10676	GAGAN AGGARWAL	gagan@jmv.co.in	e8eef3e6-c5e3-4fd7-8a14-f5f11977a88c	\N	employee	t	t	{}	2026-04-27 06:40:00.172162+00	2026-04-27 06:40:00.172162+00	f
0246b919-baf5-4312-b4e8-db5b051eba99	JMV10695	RAMKRISHNA WATH	ramkrishna@jmv.co.in	e8eef3e6-c5e3-4fd7-8a14-f5f11977a88c	\N	employee	t	t	{}	2026-04-27 06:40:00.17605+00	2026-04-27 06:40:00.17605+00	f
782a3d00-9621-4567-b4d5-fa75850c985d	FACL1832	RANJIT KUMAR	earthingstore@jmv.co.in	dfd1e168-4be6-40e0-9ae2-4c33a2fe20f0	\N	employee	t	t	{}	2026-04-27 06:40:00.180855+00	2026-04-27 06:40:00.180855+00	f
7632e416-09a4-4050-9359-9a725be51599	JMV10113	SACHIN KUMAR	logistics@jmv.co.in	25fe3189-7737-4097-80a3-043fc0c5a47a	\N	employee	t	t	{}	2026-04-27 06:40:00.187851+00	2026-04-27 06:40:00.187851+00	f
f219391d-2041-4fd9-98bc-3b5ccc453d04	JMV10126	CHETAN BABU	chetan@jmv.co.in	7d259614-5d14-4e0a-9582-843fa70986b2	\N	employee	t	t	{}	2026-04-27 06:40:00.193499+00	2026-04-27 06:40:00.193499+00	f
1b85b3a0-89c6-4520-92a5-01a95eeaa14e	J1237	GEETA BISHT	geeta@jmv.co.in	803a8c85-9439-46a1-a176-52bd6c485d07	\N	employee	t	t	{}	2026-04-27 06:40:00.199625+00	2026-04-27 06:40:00.199625+00	f
ad9945d7-7e4e-4ab2-9b7c-68c91582a869	J1256	ANJALI PAL	anjali@jmv.co.in	803a8c85-9439-46a1-a176-52bd6c485d07	\N	employee	t	t	{}	2026-04-27 06:40:00.204539+00	2026-04-27 06:40:00.204539+00	f
ddeb7d9d-4405-4f64-88cd-85cabc587eb2	JMV10492	DIVYA GOSWAMI	divya@jmv.co.in	803a8c85-9439-46a1-a176-52bd6c485d07	\N	employee	t	t	{}	2026-04-27 06:40:00.208627+00	2026-04-27 06:40:00.208627+00	f
42c3df15-9e42-4cfd-9b0b-4db73640de76	JMV10494	SHWETA SAH	shweta@jmv.co.in	803a8c85-9439-46a1-a176-52bd6c485d07	\N	employee	t	t	{}	2026-04-27 06:40:00.213152+00	2026-04-27 06:40:00.213152+00	f
4b695b3b-b533-4e6f-b313-fbf5b3db3315	J1238	VINITA PATEL	reception@jmv.co.in	80612130-c9e0-4173-b663-e86091bf3ebc	\N	employee	t	t	{}	2026-04-27 06:40:00.220073+00	2026-04-27 06:40:00.220073+00	f
d3fc69cb-3b81-4aca-9d7a-e6923f075b8c	JMV10001	AANCHAL KALRA	hr@jmv.co.in	80612130-c9e0-4173-b663-e86091bf3ebc	\N	employee	t	t	{}	2026-04-27 06:40:00.22471+00	2026-04-27 06:40:00.22471+00	f
fcb8791f-63d6-4a84-a0cc-3b7ce13a3d1e	JMV10493	KIRAN SHARMA	kiran@jmv.co.in	80612130-c9e0-4173-b663-e86091bf3ebc	\N	employee	t	t	{}	2026-04-27 06:40:00.229283+00	2026-04-27 06:40:00.229283+00	f
39649429-83dd-45be-952b-15f31d87bf44	J1275	SHASHANK RAI	shashank@jmv.co.in	29077b5b-ca9b-4222-b563-10b538564a1e	\N	employee	t	t	{}	2026-04-27 06:40:00.239136+00	2026-04-27 06:40:00.239136+00	f
00773ec9-f349-443d-9b6e-dd223642071b	JMV10114	SACHIN JAISWAL	admin2@jmv.co.in	29077b5b-ca9b-4222-b563-10b538564a1e	\N	employee	t	t	{}	2026-04-27 06:40:00.243812+00	2026-04-27 06:40:00.243812+00	f
12a23be7-89f2-4df2-ba5d-2be3a48a6815	JMV10387	VIKASH NANDAN MISHRA	vikasmishra@jmv.co.in	29077b5b-ca9b-4222-b563-10b538564a1e	\N	employee	t	t	{}	2026-04-27 06:40:00.248264+00	2026-04-27 06:40:00.248264+00	f
4038cee1-da39-48fb-8e2f-389480631269	JMV10109	MEENAKSHI SINGH	meenakshi@jmv.co.in	35d079bc-5e57-428d-a968-a2dd8d5fae2e	\N	employee	t	t	{}	2026-04-27 06:40:00.254812+00	2026-04-27 06:40:00.254812+00	f
5fc52a7f-2686-4625-84a9-da44d73f0a46	JMV10111	PRAVESH SINGH	pravesh@jmv.co.in	35d079bc-5e57-428d-a968-a2dd8d5fae2e	\N	employee	t	t	{}	2026-04-27 06:40:00.259127+00	2026-04-27 06:40:00.259127+00	f
91dc50a7-a762-4d6d-83a2-2630ab805d59	JMV10139	SANDEEP KUMAR	sandeep@jmv.co.in	35d079bc-5e57-428d-a968-a2dd8d5fae2e	\N	employee	t	t	{}	2026-04-27 06:40:00.263356+00	2026-04-27 06:40:00.263356+00	f
d81d125d-eb16-49a0-a5c8-143935583a04	JMV10415	GARVIT SAINI	garvit@jmv.co.in	a1ae228f-ad2c-44e7-a18c-e0582a56822e	\N	employee	t	t	{}	2026-04-27 06:40:00.268841+00	2026-04-27 06:40:00.268841+00	f
55d5233f-bd5e-4fc0-941b-3d9a146d3a88	J1283	KAVESH MASAND	kavesh@jmv.co.in	c030e892-58b2-4d44-8545-990b35543565	\N	employee	t	t	{}	2026-04-27 06:40:00.274145+00	2026-04-27 06:40:00.274145+00	f
608a66c8-f786-4743-9979-c632148fb6ac	JMV10386	SHAILENDRA KUMAR PACHAURI	purchase@jmv.co.in	c030e892-58b2-4d44-8545-990b35543565	\N	employee	t	t	{}	2026-04-27 06:40:00.279176+00	2026-04-27 06:40:00.279176+00	f
6607e130-9e89-4b9e-9181-3c35af2a280c	JMV10395	HITESH SHARMA	hitesh@jmv.co.in	c030e892-58b2-4d44-8545-990b35543565	\N	employee	t	t	{}	2026-04-27 06:40:00.284531+00	2026-04-27 06:40:00.284531+00	f
f4012eca-87cd-445f-b392-23fb1529509f	JMV10425	DEVRAJ SINGH	devraj@jmv.co.in	c030e892-58b2-4d44-8545-990b35543565	\N	employee	t	t	{}	2026-04-27 06:40:00.289772+00	2026-04-27 06:40:00.289772+00	f
13e1f9c8-3996-4585-ae1b-73ad4598865a	J1231	PREETI SINGH	preeti@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.297106+00	2026-04-27 06:40:00.297106+00	f
ab7361a9-f74b-46e7-ab6f-4fa52e5a8ca0	J1249	KAJAL CHAUHAN	kajal@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.302293+00	2026-04-27 06:40:00.302293+00	f
999e67e7-da1b-446c-baf9-1736bdc8acf3	J1273	SIDDARTH CHATURVEDI	siddhartha.chaturvedi@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.306944+00	2026-04-27 06:40:00.306944+00	f
70b79fe2-f976-4def-8e8a-c1efbd76d11c	J1313	VASUDEV	vasudev.gupta@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.311371+00	2026-04-27 06:40:00.311371+00	f
dccbaf2f-8593-4a00-913e-6d50522fccf1	J1325	SHAGUN MITTAL	shagun@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.31616+00	2026-04-27 06:40:00.31616+00	f
d41752ac-0ab5-4426-b19f-99537b7e63f8	JMV10103	CHANDRA KISHOR SHARMA	chandarkishor@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.320633+00	2026-04-27 06:40:00.320633+00	f
366ee2f9-5621-4305-9a86-b470a1887965	JMV10112	ROHIT SAXENA	rohitsaxena@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.326447+00	2026-04-27 06:40:00.326447+00	f
f3fa85c8-6968-44a8-8fe1-79569102e1d3	JMV10416	SHUBHAM SINGH	shubhamsingh@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.332424+00	2026-04-27 06:40:00.332424+00	f
4b317149-e663-4682-af55-ca7823bce8f9	JMV10439	VISHAL SINGH	vishal@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.337686+00	2026-04-27 06:40:00.337686+00	f
09588ab4-1767-4afe-96ae-b708283efb85	j1268	P R  SHANTI  KRISHNA	shanti@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.343019+00	2026-04-27 06:40:00.343019+00	f
1d15440f-9e8f-4f8f-bc68-bc14f4fbf479	JMV10731	GANPATI MISHRA	ganpati@jmv.co.in	7943c35d-d2d9-4a3b-90ee-6b23871f103e	\N	employee	t	t	{}	2026-04-27 06:40:00.34781+00	2026-04-27 06:40:00.34781+00	f
4bf322c0-7045-4a3a-8206-0723bfe24b94	EMP-001	IT_OPs---John	doe692568@gmail.com	65d075c8-42ec-476a-83a9-6dc2e02d527e	369217838071676931	it_ops	t	t	{}	2026-04-27 11:47:58.289266+00	2026-04-27 18:22:10.691843+00	f
d7595e68-506d-48f0-b2ab-e1d4d5e9f764	JMV000000	Employee Asset	vmodi5425@gmail.com	65d075c8-42ec-476a-83a9-6dc2e02d527e	369217920766574595	employee	t	t	{}	2026-04-27 18:25:57.301743+00	2026-04-27 18:26:07.04505+00	f
aa2aebbb-4b78-4ce3-886d-a85ebc444632	JMV10758	AALLOKIKA BHATNAGAR	aallokika@jmv.co.in	80612130-c9e0-4173-b663-e86091bf3ebc	\N	employee	t	t	{}	2026-04-27 11:22:58.396727+00	2026-04-27 20:53:57.630679+00	f
\.


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.locations (id, code, name, address, is_active, metadata, created_at, updated_at) FROM stdin;
4da76a93-03eb-493e-aa76-1038a694cc45	JMV_LPS_LTD,_W-50,_S	JMV LPS LTD, W-50, Sector-11, Noida, Gautam Buddha Nagar, Uttar Pradesh, 201301	\N	t	{}	2026-04-27 16:49:47.704418+00	2026-04-27 16:49:47.704418+00
e17679c0-b5e9-42a5-aba3-a175011e8db6	JMV_LPS_LTD_(UNIT-J1	JMV LPS LTD (Unit-J12), J-12, Site-C, Surajpur Industrial Area, Greater Noida, Uttar Pradesh, 201306	\N	t	{}	2026-04-27 16:57:32.937386+00	2026-04-27 16:57:32.937386+00
0c6951c5-b0f8-42a8-bf6c-7eb559d33a0f	W-50	W-50	\N	t	{}	2026-04-27 17:30:23.399887+00	2026-04-27 17:30:23.399887+00
\.


--
-- Data for Name: manufacturers; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.manufacturers (id, name, website, is_active, metadata, created_at, updated_at) FROM stdin;
1a8616b1-1640-461e-92a1-a388594b72ec	Nemo dolorem non vit	\N	t	{}	2026-04-27 07:40:12.230978+00	2026-04-27 07:40:12.230978+00
3c3dea0d-3c62-412e-adfc-f273ce53ce60	Dignissimos ut rerum	\N	t	{}	2026-04-27 07:44:52.879042+00	2026-04-27 07:44:52.879042+00
1d13edca-c3a9-40ef-b4e0-cb751135f21d	Facere voluptatem q	\N	t	{}	2026-04-27 07:53:33.852888+00	2026-04-27 07:53:33.852888+00
b22d4219-bccc-4f8a-b074-8df5d2011adf	Esse ea illum cons	\N	t	{}	2026-04-27 07:58:31.721419+00	2026-04-27 07:58:31.721419+00
fd2cb936-aef7-4c2f-93c6-d65f13920f33	Non magni quo in a v	\N	t	{}	2026-04-27 07:59:12.495902+00	2026-04-27 07:59:12.495902+00
79e1eb81-8bb6-49a8-b82e-27b8f92d188e	Nihil aliquip doloru	\N	t	{}	2026-04-27 08:00:50.682297+00	2026-04-27 08:00:50.682297+00
593cafcb-33bb-43a0-a43f-5cd373235fad	Unde voluptas ad com	\N	t	{}	2026-04-27 08:03:57.401602+00	2026-04-27 08:03:57.401602+00
a05dced3-f734-4cd5-ba9b-6f86bd2ef037	Laboris reprehenderi	\N	t	{}	2026-04-27 08:06:21.197191+00	2026-04-27 08:06:21.197191+00
4ac049d5-b1cf-49df-bf66-6c5fedbe23af	Animi qui ut porro	\N	t	{}	2026-04-27 08:08:10.422167+00	2026-04-27 08:08:10.422167+00
25121d84-8839-4d32-846d-14556402bc5a	Ut aperiam a consect	\N	t	{}	2026-04-27 08:08:59.0817+00	2026-04-27 08:08:59.0817+00
cc40703a-285d-4564-9387-bc32ea00c327	Voluptas voluptatem	\N	t	{}	2026-04-27 09:16:04.081067+00	2026-04-27 09:16:04.081067+00
b8f35d48-b68d-415c-b2a3-b2b00c54ec21	Laboriosam cumque e	\N	t	{}	2026-04-27 09:38:54.064127+00	2026-04-27 09:38:54.064127+00
dfe3763b-3ad5-4a99-8656-b9df6f749bb9	Dell	\N	t	{}	2026-04-27 10:06:45.524989+00	2026-04-27 10:06:45.524989+00
566bd7d8-d23c-4f95-988f-afc04f73bdf9	Logitech	\N	t	{}	2026-04-27 10:06:45.571581+00	2026-04-27 10:06:45.571581+00
f8a9bd5c-c535-434c-b936-2f97e420b233	Hp	\N	t	{}	2026-04-27 10:06:45.593343+00	2026-04-27 10:06:45.593343+00
b5db954f-b318-4efb-b27d-83e19b68f244	G	\N	t	{}	2026-04-27 10:06:45.636611+00	2026-04-27 10:06:45.636611+00
4b5a4d44-d0c1-4624-a63f-38639eb8c097	Lenovo	\N	t	{}	2026-04-27 10:06:45.64668+00	2026-04-27 10:06:45.64668+00
ccd40f94-1f2f-4965-8c7c-926c80b4969f	64Gb	\N	t	{}	2026-04-27 10:06:45.670922+00	2026-04-27 10:06:45.670922+00
f0baf24b-1c63-4ebb-ab9d-8aeaf36f117a	Lenevo	\N	t	{}	2026-04-27 10:06:45.736289+00	2026-04-27 10:06:45.736289+00
daaaf5e0-f4cb-4fc5-a325-c3902312f28a	Kali	\N	t	{}	2026-04-27 10:06:45.766402+00	2026-04-27 10:06:45.766402+00
6dcf6163-6bf7-48c2-a7ad-2d79bea3a429	Ex ex voluptas volup	\N	t	{}	2026-04-27 11:53:42.229598+00	2026-04-27 11:53:42.229598+00
0507c57b-3950-4103-b738-00e3c711f913	Minus dicta atque ma	\N	t	{}	2026-04-27 12:12:31.342008+00	2026-04-27 12:12:31.342008+00
62913146-61eb-4328-b162-7db176dbe23f	Magni et eos omnis m	\N	t	{}	2026-04-27 12:13:44.406745+00	2026-04-27 12:13:44.406745+00
a668ba66-c349-4209-aa3b-ff43893bcb02	Modi omnis impedit	\N	t	{}	2026-04-27 12:20:55.390936+00	2026-04-27 12:20:55.390936+00
d037858b-0789-47b4-b293-1041d358a363	Consectetur nemo ame	\N	t	{}	2026-04-27 13:13:26.510196+00	2026-04-27 13:13:26.510196+00
078dd74d-b0b7-4a32-b672-7f8e208e44b4	Sed lorem suscipit p	\N	t	{}	2026-04-27 15:51:21.820708+00	2026-04-27 15:51:21.820708+00
860e074f-aed2-445a-bc55-46cd73dc557e	Optio excepteur et	\N	t	{}	2026-04-27 15:53:18.541439+00	2026-04-27 15:53:18.541439+00
9ad15ee9-fac5-4b63-a738-f5dce5f76750	Error et facilis qua	\N	t	{}	2026-04-27 15:57:57.659781+00	2026-04-27 15:57:57.659781+00
a1b8a7eb-a322-4f75-ae51-1e7cb0e7c9b4	Eu quis perferendis	\N	t	{}	2026-04-27 16:03:21.993308+00	2026-04-27 16:03:21.993308+00
e8827520-f87e-4a0f-bd42-124af80a22e6	Repellendus Perspic	\N	t	{}	2026-04-27 16:10:55.939602+00	2026-04-27 16:10:55.939602+00
27c45004-cfc3-45b7-b48a-a38d79deefa5	Deserunt dolores et	\N	t	{}	2026-04-27 17:15:45.543639+00	2026-04-27 17:15:45.543639+00
8e1093cf-e5dc-4bc6-986e-9352ee046de8	Consequat Eu veniam	\N	t	{}	2026-04-27 17:16:12.11476+00	2026-04-27 17:16:12.11476+00
dd010632-7264-421f-865f-0925ba045f31	Cum ea quia est magn	\N	t	{}	2026-04-27 17:24:39.516804+00	2026-04-27 17:24:39.516804+00
4622ab5c-29be-4b12-ad42-8204f7582c1a	ASUS	\N	t	{}	2026-04-27 17:41:43.767632+00	2026-04-27 17:41:43.767632+00
\.


--
-- Data for Name: recycle_bin_entries; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.recycle_bin_entries (id, entity_type, entity_id, label, payload, deleted_at, deleted_by_employee_id, restored_at, restored_by_employee_id) FROM stdin;
6fd93569-407d-46ca-b8a3-90517437e6b4	employee	4bf322c0-7045-4a3a-8206-0723bfe24b94	IT_OPs---John (EMP-001)	{"id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "name": "IT_OPs---John", "role": "employee", "email": "doe692568@gmail.com", "is_active": true, "department": "SOFTWARE", "employee_id": "EMP-001", "auth_user_id": null}	2026-04-27 11:48:26.135853+00	\N	2026-04-27 11:48:31.539787+00	9ab281f1-c379-4f58-9156-d0c65da75e99
d90d9e32-dcaf-4641-9352-dcad08dd8cb0	employee	4bf322c0-7045-4a3a-8206-0723bfe24b94	IT_OPs---John (EMP-001)	{"id": "4bf322c0-7045-4a3a-8206-0723bfe24b94", "name": "IT_OPs---John", "role": "employee", "email": "doe692568@gmail.com", "is_active": true, "department": "SOFTWARE", "employee_id": "EMP-001", "auth_user_id": null}	2026-04-27 11:53:16.376073+00	\N	2026-04-27 11:53:21.919874+00	9ab281f1-c379-4f58-9156-d0c65da75e99
4d84df73-8d60-4bb8-b5f1-4cee70cda442	asset	1d9e3d7a-f3c7-4083-a324-1b9fd5cf3f18	AST-00083	{"reason": null}	2026-04-27 19:39:32.011071+00	4bf322c0-7045-4a3a-8206-0723bfe24b94	2026-04-27 19:39:49.352424+00	4bf322c0-7045-4a3a-8206-0723bfe24b94
\.


--
-- Data for Name: role_audit_log; Type: TABLE DATA; Schema: public; Owner: assetmanager_user
--

COPY public.role_audit_log (id, actor_employee_id, target_employee_id, old_role, new_role, action, metadata, created_at) FROM stdin;
\.


--
-- Name: asset_tag_seq; Type: SEQUENCE SET; Schema: public; Owner: assetmanager_user
--

SELECT pg_catalog.setval('public.asset_tag_seq', 1, false);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: asset_assignments asset_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_assignments
    ADD CONSTRAINT asset_assignments_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_slug_key UNIQUE (slug);


--
-- Name: asset_components asset_components_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_components
    ADD CONSTRAINT asset_components_pkey PRIMARY KEY (id);


--
-- Name: asset_components asset_components_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_components
    ADD CONSTRAINT asset_components_serial_number_key UNIQUE (serial_number);


--
-- Name: asset_events asset_events_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_events
    ADD CONSTRAINT asset_events_pkey PRIMARY KEY (id);


--
-- Name: asset_logs asset_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_logs
    ADD CONSTRAINT asset_logs_pkey PRIMARY KEY (id);


--
-- Name: assets assets_asset_tag_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_tag_key UNIQUE (asset_tag);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assets assets_serial_number_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_serial_number_key UNIQUE (serial_number);


--
-- Name: custom_field_definitions custom_field_definitions_category_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_category_id_field_key_key UNIQUE (category_id, field_key);


--
-- Name: custom_field_definitions custom_field_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: employees employees_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: employees employees_email_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_key UNIQUE (email);


--
-- Name: employees employees_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: locations locations_code_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_code_key UNIQUE (code);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: manufacturers manufacturers_name_key; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_name_key UNIQUE (name);


--
-- Name: manufacturers manufacturers_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_pkey PRIMARY KEY (id);


--
-- Name: recycle_bin_entries recycle_bin_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.recycle_bin_entries
    ADD CONSTRAINT recycle_bin_entries_pkey PRIMARY KEY (id);


--
-- Name: role_audit_log role_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.role_audit_log
    ADD CONSTRAINT role_audit_log_pkey PRIMARY KEY (id);


--
-- Name: idx_asset_events_actor; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_asset_events_actor ON public.asset_events USING btree (actor_id);


--
-- Name: idx_asset_events_asset; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_asset_events_asset ON public.asset_events USING btree (asset_id);


--
-- Name: idx_asset_events_type; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_asset_events_type ON public.asset_events USING btree (event_type);


--
-- Name: idx_asset_logs_actor; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_asset_logs_actor ON public.asset_logs USING btree (actor_employee_id);


--
-- Name: idx_asset_logs_asset; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_asset_logs_asset ON public.asset_logs USING btree (asset_id);


--
-- Name: idx_asset_logs_created; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_asset_logs_created ON public.asset_logs USING btree (created_at DESC);


--
-- Name: idx_assets_category; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assets_category ON public.assets USING btree (category_id) WHERE (is_deleted = false);


--
-- Name: idx_assets_is_deleted; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assets_is_deleted ON public.assets USING btree (is_deleted);


--
-- Name: idx_assets_location; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assets_location ON public.assets USING btree (location_id) WHERE (is_deleted = false);


--
-- Name: idx_assets_status; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assets_status ON public.assets USING btree (status) WHERE (is_deleted = false);


--
-- Name: idx_assets_updated_at; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assets_updated_at ON public.assets USING btree (updated_at DESC) WHERE (is_deleted = false);


--
-- Name: idx_assignments_asset; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assignments_asset ON public.asset_assignments USING btree (asset_id);


--
-- Name: idx_assignments_dates; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assignments_dates ON public.asset_assignments USING btree (assigned_at DESC);


--
-- Name: idx_assignments_employee; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assignments_employee ON public.asset_assignments USING btree (employee_id);


--
-- Name: idx_assignments_open; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_assignments_open ON public.asset_assignments USING btree (asset_id) WHERE (returned_at IS NULL);


--
-- Name: idx_employees_auth_user; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_employees_auth_user ON public.employees USING btree (auth_user_id);


--
-- Name: idx_employees_department; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_employees_department ON public.employees USING btree (department_id);


--
-- Name: idx_employees_email; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_employees_email ON public.employees USING btree (email);


--
-- Name: idx_employees_is_active; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_employees_is_active ON public.employees USING btree (is_active);


--
-- Name: idx_employees_role; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_employees_role ON public.employees USING btree (role);


--
-- Name: idx_recycle_bin_entity; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_recycle_bin_entity ON public.recycle_bin_entries USING btree (entity_type, entity_id);


--
-- Name: idx_recycle_bin_open; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE INDEX idx_recycle_bin_open ON public.recycle_bin_entries USING btree (entity_id) WHERE (restored_at IS NULL);


--
-- Name: ux_asset_one_open_assignment; Type: INDEX; Schema: public; Owner: assetmanager_user
--

CREATE UNIQUE INDEX ux_asset_one_open_assignment ON public.asset_assignments USING btree (asset_id) WHERE (returned_at IS NULL);


--
-- Name: assets trg_assets_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: asset_assignments trg_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_assignments_updated_at BEFORE UPDATE ON public.asset_assignments FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: asset_categories trg_categories_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.asset_categories FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: custom_field_definitions trg_custom_fields_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_custom_fields_updated_at BEFORE UPDATE ON public.custom_field_definitions FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: departments trg_departments_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: employees trg_employees_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: locations trg_locations_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: manufacturers trg_manufacturers_updated_at; Type: TRIGGER; Schema: public; Owner: assetmanager_user
--

CREATE TRIGGER trg_manufacturers_updated_at BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


--
-- Name: admin_audit_log admin_audit_log_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.employees(id);


--
-- Name: admin_audit_log admin_audit_log_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.employees(id);


--
-- Name: asset_assignments asset_assignments_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_assignments
    ADD CONSTRAINT asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_assignments asset_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_assignments
    ADD CONSTRAINT asset_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;


--
-- Name: asset_components asset_components_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_components
    ADD CONSTRAINT asset_components_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_components asset_components_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_components
    ADD CONSTRAINT asset_components_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id);


--
-- Name: asset_events asset_events_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_events
    ADD CONSTRAINT asset_events_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: asset_logs asset_logs_actor_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_logs
    ADD CONSTRAINT asset_logs_actor_employee_id_fkey FOREIGN KEY (actor_employee_id) REFERENCES public.employees(id);


--
-- Name: asset_logs asset_logs_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.asset_logs
    ADD CONSTRAINT asset_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories(id);


--
-- Name: assets assets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id);


--
-- Name: assets assets_deleted_by_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_deleted_by_employee_id_fkey FOREIGN KEY (deleted_by_employee_id) REFERENCES public.employees(id);


--
-- Name: assets assets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: assets assets_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id);


--
-- Name: assets assets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.employees(id);


--
-- Name: custom_field_definitions custom_field_definitions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.asset_categories(id) ON DELETE CASCADE;


--
-- Name: employees employees_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: recycle_bin_entries recycle_bin_entries_deleted_by_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.recycle_bin_entries
    ADD CONSTRAINT recycle_bin_entries_deleted_by_employee_id_fkey FOREIGN KEY (deleted_by_employee_id) REFERENCES public.employees(id);


--
-- Name: recycle_bin_entries recycle_bin_entries_restored_by_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.recycle_bin_entries
    ADD CONSTRAINT recycle_bin_entries_restored_by_employee_id_fkey FOREIGN KEY (restored_by_employee_id) REFERENCES public.employees(id);


--
-- Name: role_audit_log role_audit_log_actor_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.role_audit_log
    ADD CONSTRAINT role_audit_log_actor_employee_id_fkey FOREIGN KEY (actor_employee_id) REFERENCES public.employees(id);


--
-- Name: role_audit_log role_audit_log_target_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: assetmanager_user
--

ALTER TABLE ONLY public.role_audit_log
    ADD CONSTRAINT role_audit_log_target_employee_id_fkey FOREIGN KEY (target_employee_id) REFERENCES public.employees(id);


--
-- PostgreSQL database dump complete
--



-- ── Asset tag nomenclature: JMV-{ALIAS}-##### (per-category counter) ──
-- Added 2026-08. Replaces the legacy global AST-##### generator.
ALTER TABLE public.asset_categories ADD COLUMN IF NOT EXISTS alias text;
ALTER TABLE public.asset_categories ADD COLUMN IF NOT EXISTS tag_seq bigint NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_categories_alias ON public.asset_categories(alias) WHERE alias IS NOT NULL;
UPDATE public.asset_categories SET alias = m.alias FROM (VALUES
  ('laptop','LAP'),('desktop','DES'),('mobile','MOB'),('printer','PRN'),
  ('monitor','MON'),('mouse','MOU'),('keyboard','KBD'),('pen-drive','PDR'),
  ('locker','LCK'),('other','OTH')
) AS m(slug,alias) WHERE public.asset_categories.slug = m.slug AND public.asset_categories.alias IS NULL;
DROP FUNCTION IF EXISTS public.fn_next_asset_tag();

-- Asset inventory status must always be set; default to in_stock (was being stored NULL when
-- create passed status omitted, showing as "—" in the UI).
UPDATE public.assets SET status = 'in_stock' WHERE status IS NULL;
ALTER TABLE public.assets ALTER COLUMN status SET NOT NULL;
