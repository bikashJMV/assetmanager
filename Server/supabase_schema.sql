-- Create the Assets table
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT UNIQUE NOT NULL,
    asset_type TEXT,
    brand TEXT,
    model TEXT,
    processor TEXT,
    ram TEXT,
    storage TEXT,
    serial_number TEXT,
    purchase_date DATE,
    warranty_expiry DATE,
    assigned_to TEXT,
    employee_email TEXT,
    department TEXT,
    location TEXT,
    status TEXT,
    condition TEXT,
    last_updated DATE,
    notes TEXT
);

-- Create the AssetLog table
CREATE TABLE asset_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT REFERENCES assets(asset_id) ON DELETE CASCADE,
    note TEXT,
    qr_code TEXT, -- base64 string
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
