-- =====================================================
-- 1. ستون‌های جدید در همان جدول
-- =====================================================

ALTER TABLE public.power_tenders
    ADD COLUMN IF NOT EXISTS city text,
    ADD COLUMN IF NOT EXISTS province text,
    ADD COLUMN IF NOT EXISTS structure_type text,
    ADD COLUMN IF NOT EXISTS wind_load text,
    ADD COLUMN IF NOT EXISTS snow_load text,
    ADD COLUMN IF NOT EXISTS structure_weight text,
    ADD COLUMN IF NOT EXISTS proposed_price text;


-- =====================================================
-- 2. اطمینان از وجود گروه کاربر
-- group_a = فنی
-- group_b = بازرگانی
-- =====================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS user_group text NOT NULL DEFAULT 'group_b';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_user_group_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_group_check
    CHECK (user_group IN ('group_a', 'group_b'));


-- =====================================================
-- 3. تابع امن دریافت اطلاعات قابل مشاهده
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_visible_tenders()
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin boolean;
    v_group text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'برای مشاهده اطلاعات باید وارد شوید.';
    END IF;

    SELECT p.is_admin, p.user_group
    INTO v_admin, v_group
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'پروفایل کاربر پیدا نشد.';
    END IF;

    IF v_admin THEN
        RETURN QUERY
        SELECT to_jsonb(t)
        FROM public.power_tenders t
        ORDER BY t.created_at ASC;
    ELSIF v_group = 'group_a' THEN
        RETURN QUERY
        SELECT jsonb_build_object(
            'id', t.id,
            'created_at', t.created_at,
            'tender_name', t.tender_name,
            'capacity_mw', t.capacity_mw,
            'employer', t.employer,
            'consultant', t.consultant,
            'tonnage', t.tonnage,
            'tender_date', t.tender_date,
            'tender_number', t.tender_number,
            'city', t.city,
            'province', t.province,
            'structure_type', t.structure_type,
            'wind_load', t.wind_load,
            'snow_load', t.snow_load,
            'structure_weight', t.structure_weight
        )
        FROM public.power_tenders t
        ORDER BY t.created_at ASC;
    ELSIF v_group = 'group_b' THEN
        RETURN QUERY
        SELECT jsonb_build_object(
            'id', t.id,
            'created_at', t.created_at,
            'tender_name', t.tender_name,
            'capacity_mw', t.capacity_mw,
            'employer', t.employer,
            'proposer', t.proposer,
            'tender_date', t.tender_date,
            'tender_number', t.tender_number,
            'notes', t.notes,
            'follow_up_stage', t.follow_up_stage,
            'proposed_price', t.proposed_price
        )
        FROM public.power_tenders t
        ORDER BY t.created_at ASC;
    ELSE
        RAISE EXCEPTION 'گروه کاربر معتبر نیست.';
    END IF;
END;
$$;


-- =====================================================
-- 4. تابع امن افزودن و ویرایش مناقصه توسط مدیر
-- =====================================================

CREATE OR REPLACE FUNCTION public.save_tender(
    p_payload jsonb,
    p_tender_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin boolean;
    v_id uuid;
BEGIN
    SELECT p.is_admin
    INTO v_admin
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF auth.uid() IS NULL OR COALESCE(v_admin, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'فقط مدیر اجازه ذخیره یا ویرایش مناقصه را دارد.';
    END IF;

    IF p_tender_id IS NULL THEN
        INSERT INTO public.power_tenders (
            tender_name, capacity_mw, employer, consultant, tonnage,
            proposer, tender_date, tender_number, follow_up_stage,
            final_result, notes, city, province, structure_type,
            wind_load, snow_load, structure_weight, proposed_price,
            updated_at
        )
        VALUES (
            p_payload->>'tender_name',
            p_payload->>'capacity_mw',
            p_payload->>'employer',
            p_payload->>'consultant',
            p_payload->>'tonnage',
            p_payload->>'proposer',
            p_payload->>'tender_date',
            p_payload->>'tender_number',
            p_payload->>'follow_up_stage',
            p_payload->>'final_result',
            p_payload->>'notes',
            p_payload->>'city',
            p_payload->>'province',
            p_payload->>'structure_type',
            p_payload->>'wind_load',
            p_payload->>'snow_load',
            p_payload->>'structure_weight',
            p_payload->>'proposed_price',
            now()
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.power_tenders
        SET
            tender_name = p_payload->>'tender_name',
            capacity_mw = p_payload->>'capacity_mw',
            employer = p_payload->>'employer',
            consultant = p_payload->>'consultant',
            tonnage = p_payload->>'tonnage',
            proposer = p_payload->>'proposer',
            tender_date = p_payload->>'tender_date',
            tender_number = p_payload->>'tender_number',
            follow_up_stage = p_payload->>'follow_up_stage',
            final_result = p_payload->>'final_result',
            notes = p_payload->>'notes',
            city = p_payload->>'city',
            province = p_payload->>'province',
            structure_type = p_payload->>'structure_type',
            wind_load = p_payload->>'wind_load',
            snow_load = p_payload->>'snow_load',
            structure_weight = p_payload->>'structure_weight',
            proposed_price = p_payload->>'proposed_price',
            updated_at = now()
        WHERE id = p_tender_id
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
            RAISE EXCEPTION 'مناقصه پیدا نشد.';
        END IF;
    END IF;

    RETURN v_id;
END;
$$;


-- =====================================================
-- 5. تابع امن حذف مناقصه توسط مدیر
-- =====================================================

CREATE OR REPLACE FUNCTION public.delete_tender(p_tender_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin boolean;
BEGIN
    SELECT p.is_admin
    INTO v_admin
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF auth.uid() IS NULL OR COALESCE(v_admin, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'فقط مدیر اجازه حذف مناقصه را دارد.';
    END IF;

    DELETE FROM public.power_tenders
    WHERE id = p_tender_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مناقصه پیدا نشد.';
    END IF;

    RETURN true;
END;
$$;


-- =====================================================
-- 6. دسترسی به توابع
-- =====================================================

REVOKE ALL ON FUNCTION public.get_visible_tenders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_tender(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_tender(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_visible_tenders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_tender(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tender(uuid) TO authenticated;


-- =====================================================
-- 7. جلوگیری از خواندن مستقیم همه ستون‌ها
-- =====================================================

REVOKE SELECT, INSERT, UPDATE, DELETE
ON TABLE public.power_tenders
FROM anon, authenticated;

-- عملیات خواندن/نوشتن از توابع بالا انجام می‌شود.
