-- 06_seed.sql
-- Idempotent reference seed for AMS V2

set search_path = public;

insert into departments (name)
values
  ('Engineering'),
  ('Finance'),
  ('Operations'),
  ('HR'),
  ('IT Support')
on conflict (name) do nothing;

insert into manufacturers (name)
values
  ('Dell'),
  ('HP'),
  ('Lenovo'),
  ('Apple'),
  ('Acer'),
  ('Cisco'),
  ('TP-Link'),
  ('Samsung'),
  ('SanDisk')
on conflict (name) do nothing;

insert into locations (code, name)
values
  ('BLR-HQ', 'Bengaluru HQ'),
  ('GGN-CH', 'Gurugram Cyber Hub'),
  ('MUM-OF1', 'Mumbai Office 1'),
  ('DEL-DC', 'Delhi Distribution Center')
on conflict (code) do nothing;

insert into asset_categories (slug, name, description)
values
  ('laptop', 'Laptop', 'Portable computers'),
  ('desktop', 'Desktop', 'Desktop workstations'),
  ('sim', 'SIM', 'SIM cards and mobile data assets'),
  ('pen-drive', 'Pen Drive', 'USB removable storage'),
  ('monitor', 'Monitor', 'Display units'),
  ('networking', 'Networking', 'Routers, switches, access points and similar devices')
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = now();

with definitions as (
  select *
  from (values
    ('laptop','processor','Processor','text',true,10,'[]'::jsonb),
    ('laptop','generation','Generation','text',false,20,'[]'::jsonb),
    ('laptop','ram_gb','RAM (GB)','number',false,30,'[]'::jsonb),
    ('laptop','ram_type','RAM Type','text',false,40,'[]'::jsonb),
    ('laptop','storage_gb','Storage (GB)','number',false,50,'[]'::jsonb),
    ('laptop','storage_type','Storage Type','text',false,60,'[]'::jsonb),
    ('laptop','mac_wifi','Wi-Fi MAC','text',false,70,'[]'::jsonb),
    ('laptop','mac_lan','LAN MAC','text',false,80,'[]'::jsonb),
    ('laptop','os','Operating System','text',false,90,'[]'::jsonb),
    ('laptop','host_name','Host Name','text',false,100,'[]'::jsonb),

    ('desktop','processor','Processor','text',true,10,'[]'::jsonb),
    ('desktop','generation','Generation','text',false,20,'[]'::jsonb),
    ('desktop','ram_gb','RAM (GB)','number',false,30,'[]'::jsonb),
    ('desktop','storage_gb','Storage (GB)','number',false,40,'[]'::jsonb),
    ('desktop','storage_type','Storage Type','text',false,50,'[]'::jsonb),
    ('desktop','mac_wifi','Wi-Fi MAC','text',false,60,'[]'::jsonb),
    ('desktop','mac_lan','LAN MAC','text',false,70,'[]'::jsonb),
    ('desktop','os','Operating System','text',false,80,'[]'::jsonb),
    ('desktop','host_name','Host Name','text',false,90,'[]'::jsonb),

    ('sim','sim_number','SIM Number','text',true,10,'[]'::jsonb),
    ('sim','phone_number','Phone Number','text',false,20,'[]'::jsonb),
    ('sim','carrier','Carrier','text',false,30,'[]'::jsonb),
    ('sim','plan_name','Plan Name','text',false,40,'[]'::jsonb),
    ('sim','imei_1','IMEI 1','text',false,50,'[]'::jsonb),
    ('sim','imei_2','IMEI 2','text',false,60,'[]'::jsonb),
    ('sim','sim_previously_used_by','SIM Previously Used By','text',false,70,'[]'::jsonb),
    ('sim','activation_date','Activation Date','date',false,80,'[]'::jsonb),

    ('pen-drive','capacity_gb','Capacity (GB)','number',true,10,'[]'::jsonb),
    ('pen-drive','usb_type','USB Type','text',false,20,'[]'::jsonb),
    ('pen-drive','encryption_enabled','Encryption Enabled','boolean',false,30,'[]'::jsonb),
    ('pen-drive','file_system','File System','text',false,40,'[]'::jsonb),

    ('monitor','monitor_size_inch','Monitor Size (Inch)','number',false,10,'[]'::jsonb),
    ('monitor','resolution','Resolution','text',false,20,'[]'::jsonb),
    ('monitor','panel_type','Panel Type','text',false,30,'[]'::jsonb),
    ('monitor','refresh_rate_hz','Refresh Rate (Hz)','number',false,40,'[]'::jsonb),

    ('networking','device_type','Device Type','text',true,10,'[]'::jsonb),
    ('networking','ip_address','IP Address','text',false,20,'[]'::jsonb),
    ('networking','mac_lan','LAN MAC','text',false,30,'[]'::jsonb),
    ('networking','mac_wifi','Wi-Fi MAC','text',false,40,'[]'::jsonb),
    ('networking','firmware_version','Firmware Version','text',false,50,'[]'::jsonb),
    ('networking','ports','Ports','number',false,60,'[]'::jsonb)
  ) as x(slug, field_key, label, data_type, is_required, sort_order, options)
)
insert into custom_field_definitions (
  category_id,
  field_key,
  label,
  data_type,
  is_required,
  sort_order,
  options
)
select
  c.id,
  d.field_key,
  d.label,
  d.data_type::custom_field_data_type,
  d.is_required,
  d.sort_order,
  d.options
from definitions d
join asset_categories c on c.slug = d.slug
on conflict (category_id, field_key) do update
set label = excluded.label,
    data_type = excluded.data_type,
    is_required = excluded.is_required,
    sort_order = excluded.sort_order,
    options = excluded.options,
    updated_at = now();
