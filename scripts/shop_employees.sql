-- STEP 1: Create the shop_employees table
CREATE TABLE IF NOT EXISTS public.shop_employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_owner_phone text NOT NULL,
  employee_phone text NOT NULL UNIQUE,
  employee_name text,
  created_at timestamp with time zone DEFAULT now()
);

-- Note: The shop_owner_phone is the main owner's WhatsApp number.
-- When the owner registers (or adds themselves), shop_owner_phone and employee_phone will be the same.
