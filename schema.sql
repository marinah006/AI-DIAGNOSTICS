CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------------------------------
-- 1. PROFILES & ROLES TABLE
-------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile role"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );


-------------------------------------------------------
-- 2. CUSTOMERS TABLE
-------------------------------------------------------
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policies for customers
CREATE POLICY "Authenticated users can read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert customers"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (true);


-------------------------------------------------------
-- 3. DEVICES TABLE
-------------------------------------------------------
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL CHECK (device_type IN ('Laptop', 'Smartphone', 'Desktop PC', 'Tablet')),
  model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Policies for devices
CREATE POLICY "Authenticated users can read devices"
  ON public.devices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert devices"
  ON public.devices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update devices"
  ON public.devices FOR UPDATE
  TO authenticated
  USING (true);


-------------------------------------------------------
-- 4. JOB CARDS (REPAIR TICKETS) TABLE
-------------------------------------------------------
CREATE TABLE public.job_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  symptoms TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received' CHECK (status IN ('Received', 'Diagnosed', 'In Repair', 'Quality Testing', 'Ready', 'Closed')),
  assigned_technician_id UUID REFERENCES auth.users(id),
  technician_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;

-- Policies for job cards
CREATE POLICY "Authenticated users can view job cards"
  ON public.job_cards FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create job cards"
  ON public.job_cards FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update job cards"
  ON public.job_cards FOR UPDATE
  TO authenticated
  USING (true);


-------------------------------------------------------
-- 5. SPARE PARTS INVENTORY TABLE
-------------------------------------------------------
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name TEXT NOT NULL,
  compatible_devices TEXT,
  stock_quantity INT NOT NULL DEFAULT 0,
  cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  reorder_level INT NOT NULL DEFAULT 2,
  supplier_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Policies for inventory
CREATE POLICY "Authenticated users can view inventory"
  ON public.inventory FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert or modify inventory"
  ON public.inventory FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );


-------------------------------------------------------
-- 6. INVOICES & PAYMENTS TABLE
-------------------------------------------------------
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  labor_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  parts_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Cancelled')),
  paystack_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Policies for invoices
CREATE POLICY "Authenticated users can view invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert invoices"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (true);


-------------------------------------------------------
-- 7. DIAGNOSTICS EXECUTION LOG TABLE
-------------------------------------------------------
CREATE TABLE public.diagnostics_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  device_category TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.diagnostics_log ENABLE ROW LEVEL SECURITY;

-- Policies for diagnostics log
CREATE POLICY "Authenticated users can view diagnostic logs"
  ON public.diagnostics_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can log diagnostic executions"
  ON public.diagnostics_log FOR INSERT
  TO authenticated
  WITH CHECK (true);


-------------------------------------------------------
-- 8. SAMPLE DATA INSERTS (INITIAL TESTING)
-------------------------------------------------------
INSERT INTO public.inventory (item_name, compatible_devices, stock_quantity, cost_price, selling_price, reorder_level)
VALUES 
  ('iPhone 12 Battery (Original)', 'iPhone 12 / 12 Pro', 5, 2500.00, 4500.00, 2),
  ('Dell XPS 15 Charging Port IC', 'Dell XPS 15 Series', 8, 1200.00, 3000.00, 3),
  ('Samsung S21 Ultra Digitizer Assembly', 'Samsung S21 Ultra', 1, 9000.00, 15000.00, 2);