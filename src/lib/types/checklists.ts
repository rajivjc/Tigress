// =============================================================================
// Checklist types (Session 18)
// =============================================================================
// Mirrors the schema in migration 008_checklists.sql. Templates + their items
// are the reusable definitions managed by manager/owner. Instances + their
// items are the per-day materialised copies staff actually tick off.
// =============================================================================

export type ChecklistCategory = "daily" | "weekly" | "ad_hoc";

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  category: ChecklistCategory;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface ChecklistTemplateWithItems {
  template: ChecklistTemplate;
  items: ChecklistTemplateItem[];
}

export interface ChecklistInstance {
  id: string;
  template_id: string;
  date: string;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
}

export interface ChecklistInstanceItem {
  id: string;
  instance_id: string;
  template_item_id: string | null;
  label: string;
  description: string | null;
  sort_order: number;
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
}

export interface ChecklistInstanceWithItems {
  instance: ChecklistInstance;
  template: Pick<ChecklistTemplate, "id" | "name" | "description" | "category">;
  items: ChecklistInstanceItem[];
  completed_by_name: string | null;
}

export interface ChecklistInstanceSummary {
  instance_id: string;
  template_id: string;
  template_name: string;
  date: string;
  items_total: number;
  items_checked: number;
  completed_at: string | null;
  completed_by_name: string | null;
}
