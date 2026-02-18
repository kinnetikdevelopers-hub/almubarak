-- ============================================================
-- Migration: Manual Tenant Support (no auth user required)
-- ============================================================
-- Background:
--   Previously, profiles.id was always a foreign key to auth.users(id).
--   Now, admins add tenants manually — no Supabase Auth user is created.
--   This migration:
--     1. Removes the FK constraint from profiles.id → auth.users(id)
--     2. Adds a RLS policy so admins can INSERT any profile
--     3. Adds 'overdue' as a valid payment status
--     4. Adds a 'notes' column to payments for manual annotation
-- ============================================================

-- 1. Drop the foreign key from profiles to auth.users if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_id_fkey'
      AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
  END IF;
END $$;

-- 2. Ensure RLS is enabled on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Drop old restrictive insert policy if present, then re-create permissive one for admins
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 4. Ensure admins can update and delete tenant profiles
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete tenant profiles" ON public.profiles;
CREATE POLICY "Admins can delete tenant profiles"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 5. Add 'overdue' to payment status if not already present
-- (payments.status is a plain text column, no enum — just documenting expected values)
-- Add notes column to payments for manual records
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 6. Add lease_start_date to profiles if somehow missing
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lease_start_date DATE;

-- Done.
COMMENT ON TABLE public.profiles IS
  'User profiles. Tenant rows may not have a corresponding auth.users row when added manually by admin.';
