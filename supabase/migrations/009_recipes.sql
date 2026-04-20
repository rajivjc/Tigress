-- =============================================================================
-- Tigress — Recipe book (Session 19)
-- =============================================================================
-- Bar-staff-facing reference for drink recipes. Manager/owner curates the
-- catalogue; all staff can read it. Members have no access.
--
-- Three tables:
--   recipes             — header row (name, category, optional metadata)
--   recipe_ingredients  — categorised ingredient lines with amount + unit
--   recipe_steps        — ordered instruction lines
--
-- Search happens on both recipe name and ingredient name (e.g. "what uses
-- Campari?"). The trigram index on `lower(name)` keeps ingredient search
-- fast without a separate full-text column; if the pg_trgm extension is not
-- available, drop the index — plain ILIKE still works for <500 recipes.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
CREATE TABLE public.recipes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'cocktails'
    CHECK (category IN ('cocktails', 'mocktails', 'shots', 'beer', 'coffee', 'other')),
  notes             TEXT,
  prep_time_minutes INTEGER,
  image_url         TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES public.staff(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_recipes_category_active
  ON public.recipes (category, is_active);

-- ---------------------------------------------------------------------------
-- recipe_ingredients
-- ---------------------------------------------------------------------------
CREATE TABLE public.recipe_ingredients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  amount     NUMERIC,
  unit       TEXT
    CHECK (unit IS NULL OR unit IN (
      'ml', 'oz', 'cl', 'dash', 'dashes', 'splash', 'piece', 'pieces',
      'slice', 'slices', 'sprig', 'sprigs', 'scoop', 'scoops',
      'tsp', 'tbsp', 'cup', 'drop', 'drops', 'pinch', 'whole'
    )),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipe_ingredients_recipe
  ON public.recipe_ingredients (recipe_id, sort_order);

-- Trigram index for fast ingredient-name search ("what uses Campari?").
CREATE INDEX idx_recipe_ingredients_name_trgm
  ON public.recipe_ingredients USING gin (lower(name) gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- recipe_steps
-- ---------------------------------------------------------------------------
CREATE TABLE public.recipe_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipe_steps_recipe
  ON public.recipe_steps (recipe_id, step_number);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Staff read all three tables; manager/owner have full CRUD. Members have no
-- access at all (recipes are an operational concern, not a member-facing
-- feature).

ALTER TABLE public.recipes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps        ENABLE ROW LEVEL SECURITY;

-- ---------- recipes ----------
CREATE POLICY "recipes select: staff"
  ON public.recipes FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "recipes insert: manager/owner"
  ON public.recipes FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "recipes update: manager/owner"
  ON public.recipes FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "recipes delete: manager/owner"
  ON public.recipes FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- recipe_ingredients ----------
CREATE POLICY "recipe_ingredients select: staff"
  ON public.recipe_ingredients FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "recipe_ingredients insert: manager/owner"
  ON public.recipe_ingredients FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "recipe_ingredients update: manager/owner"
  ON public.recipe_ingredients FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "recipe_ingredients delete: manager/owner"
  ON public.recipe_ingredients FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));

-- ---------- recipe_steps ----------
CREATE POLICY "recipe_steps select: staff"
  ON public.recipe_steps FOR SELECT
  TO authenticated
  USING (public.get_staff_role() IN ('staff', 'manager', 'owner'));

CREATE POLICY "recipe_steps insert: manager/owner"
  ON public.recipe_steps FOR INSERT
  TO authenticated
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "recipe_steps update: manager/owner"
  ON public.recipe_steps FOR UPDATE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'))
  WITH CHECK (public.get_staff_role() IN ('manager', 'owner'));

CREATE POLICY "recipe_steps delete: manager/owner"
  ON public.recipe_steps FOR DELETE
  TO authenticated
  USING (public.get_staff_role() IN ('manager', 'owner'));
