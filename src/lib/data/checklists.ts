// =============================================================================
// Checklist data accessors (Session 18)
// =============================================================================
// Server-only helpers for reading / writing checklist templates and daily
// instances. Falls back to mock in-memory arrays when Supabase is not
// configured so local dev works without a database.
//
// Key design points:
//   - Instances are created LAZILY on first access for a given date. The
//     UNIQUE(template_id, date) constraint makes this race-safe in real mode.
//   - Instance items COPY label + description from the template item at
//     creation time. Template edits never alter historical checklists.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_CHECKLIST_INSTANCES,
  MOCK_CHECKLIST_INSTANCE_ITEMS,
  MOCK_CHECKLIST_TEMPLATES,
  MOCK_CHECKLIST_TEMPLATE_ITEMS,
} from "./mock-data";
import { MOCK_ACCOUNTS } from "@/lib/auth/mock-users";
import type {
  ChecklistCategory,
  ChecklistInstance,
  ChecklistInstanceItem,
  ChecklistInstanceSummary,
  ChecklistInstanceWithItems,
  ChecklistTemplate,
  ChecklistTemplateItem,
  ChecklistTemplateWithItems,
} from "@/lib/types/checklists";

// ---------- Helpers ----------

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function findMockStaffName(staffId: string | null): string | null {
  if (!staffId) return null;
  const account = MOCK_ACCOUNTS.find(
    (a) => a.role !== "member" && (a.profile as { id: string }).id === staffId
  );
  return account ? (account.profile as { full_name: string }).full_name : null;
}

// =============================================================================
// Template reads
// =============================================================================

export async function getChecklistTemplates(): Promise<
  ChecklistTemplateWithItems[]
> {
  if (!isSupabaseConfigured()) {
    return MOCK_CHECKLIST_TEMPLATES.slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((template) => ({
        template,
        items: MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
          (i) => i.template_id === template.id
        )
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order),
      }));
  }

  const supabase = createClient();
  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("*")
    .order("sort_order", { ascending: true });

  const templateRows = (templates as ChecklistTemplate[] | null) ?? [];
  if (templateRows.length === 0) return [];

  const { data: items } = await supabase
    .from("checklist_template_items")
    .select("*")
    .in(
      "template_id",
      templateRows.map((t) => t.id)
    )
    .order("sort_order", { ascending: true });

  const itemRows = (items as ChecklistTemplateItem[] | null) ?? [];

  return templateRows.map((template) => ({
    template,
    items: itemRows.filter((i) => i.template_id === template.id),
  }));
}

export async function getChecklistTemplate(
  templateId: string
): Promise<ChecklistTemplateWithItems | null> {
  if (!isSupabaseConfigured()) {
    const template = MOCK_CHECKLIST_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return null;
    const items = MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
      (i) => i.template_id === templateId
    )
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    return { template, items };
  }

  const supabase = createClient();
  const { data: templateRow } = await supabase
    .from("checklist_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  if (!templateRow) return null;

  const { data: items } = await supabase
    .from("checklist_template_items")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  return {
    template: templateRow as ChecklistTemplate,
    items: (items as ChecklistTemplateItem[] | null) ?? [],
  };
}

// =============================================================================
// Template writes
// =============================================================================

export interface CreateChecklistTemplateInput {
  name: string;
  description?: string | null;
  category: ChecklistCategory;
  items: { label: string; description?: string | null }[];
  createdBy: string;
}

export async function createChecklistTemplate(
  input: CreateChecklistTemplateInput
): Promise<{ success: boolean; templateId?: string; error?: string }> {
  if (!input.name.trim()) {
    return { success: false, error: "Name is required" };
  }

  if (!isSupabaseConfigured()) {
    const templateId = randomId("checklist-template");
    const now = nowIso();
    const maxOrder = MOCK_CHECKLIST_TEMPLATES.reduce(
      (m, t) => Math.max(m, t.sort_order),
      0
    );
    MOCK_CHECKLIST_TEMPLATES.push({
      id: templateId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category,
      is_active: true,
      sort_order: maxOrder + 1,
      created_by: input.createdBy,
      created_at: now,
      updated_at: now,
    });
    input.items.forEach((item, idx) => {
      MOCK_CHECKLIST_TEMPLATE_ITEMS.push({
        id: randomId("tmpl-item"),
        template_id: templateId,
        label: item.label.trim(),
        description: item.description?.trim() || null,
        sort_order: idx + 1,
        created_at: now,
      });
    });
    return { success: true, templateId };
  }

  const supabase = createClient();
  const { data: inserted, error } = await supabase
    .from("checklist_templates")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category,
      is_active: true,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }

  const templateId = (inserted as { id: string }).id;

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase
      .from("checklist_template_items")
      .insert(
        input.items.map((item, idx) => ({
          template_id: templateId,
          label: item.label.trim(),
          description: item.description?.trim() || null,
          sort_order: idx + 1,
        }))
      );
    if (itemsError) {
      // Roll back the template so we don't leave an orphan.
      await supabase.from("checklist_templates").delete().eq("id", templateId);
      return { success: false, error: itemsError.message };
    }
  }

  return { success: true, templateId };
}

export interface UpdateChecklistTemplateInput {
  name?: string;
  description?: string | null;
  category?: ChecklistCategory;
  is_active?: boolean;
  sort_order?: number;
}

export async function updateChecklistTemplate(
  templateId: string,
  input: UpdateChecklistTemplateInput
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const template = MOCK_CHECKLIST_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return { success: false, error: "Template not found" };
    if (input.name !== undefined) template.name = input.name.trim();
    if (input.description !== undefined) {
      template.description = input.description?.trim() || null;
    }
    if (input.category !== undefined) template.category = input.category;
    if (input.is_active !== undefined) template.is_active = input.is_active;
    if (input.sort_order !== undefined) template.sort_order = input.sort_order;
    template.updated_at = nowIso();
    return { success: true };
  }

  const supabase = createClient();
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.description !== undefined) {
    update.description = input.description?.trim() || null;
  }
  if (input.category !== undefined) update.category = input.category;
  if (input.is_active !== undefined) update.is_active = input.is_active;
  if (input.sort_order !== undefined) update.sort_order = input.sort_order;

  const { error } = await supabase
    .from("checklist_templates")
    .update(update)
    .eq("id", templateId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface TemplateItemInput {
  id?: string;
  label: string;
  description?: string | null;
  sort_order: number;
}

/**
 * Full-replacement item update. Items with an `id` that matches an existing
 * row are updated; items without an `id` are inserted; existing rows whose
 * `id` is NOT in the incoming list are deleted. Simpler than individual CRUD
 * for an ordered list and matches how the template-editor UI submits.
 */
export async function updateChecklistTemplateItems(
  templateId: string,
  items: TemplateItemInput[]
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const template = MOCK_CHECKLIST_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return { success: false, error: "Template not found" };

    const incomingIds = new Set(
      items.map((i) => i.id).filter((id): id is string => Boolean(id))
    );
    // Remove items not in the incoming list.
    for (let i = MOCK_CHECKLIST_TEMPLATE_ITEMS.length - 1; i >= 0; i--) {
      const row = MOCK_CHECKLIST_TEMPLATE_ITEMS[i];
      if (row.template_id === templateId && !incomingIds.has(row.id)) {
        MOCK_CHECKLIST_TEMPLATE_ITEMS.splice(i, 1);
      }
    }
    // Update existing / insert new.
    const now = nowIso();
    for (const incoming of items) {
      if (incoming.id) {
        const existing = MOCK_CHECKLIST_TEMPLATE_ITEMS.find(
          (r) => r.id === incoming.id
        );
        if (existing) {
          existing.label = incoming.label.trim();
          existing.description = incoming.description?.trim() || null;
          existing.sort_order = incoming.sort_order;
        }
      } else {
        MOCK_CHECKLIST_TEMPLATE_ITEMS.push({
          id: randomId("tmpl-item"),
          template_id: templateId,
          label: incoming.label.trim(),
          description: incoming.description?.trim() || null,
          sort_order: incoming.sort_order,
          created_at: now,
        });
      }
    }
    template.updated_at = now;
    return { success: true };
  }

  const supabase = createClient();

  // 1. Fetch current item IDs for this template
  const { data: current, error: fetchErr } = await supabase
    .from("checklist_template_items")
    .select("id")
    .eq("template_id", templateId);
  if (fetchErr) return { success: false, error: fetchErr.message };

  const currentIds = new Set(
    ((current as { id: string }[] | null) ?? []).map((r) => r.id)
  );
  const incomingIds = new Set(
    items.map((i) => i.id).filter((id): id is string => Boolean(id))
  );

  // 2. Delete items no longer in the list
  const toDelete = [...currentIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("checklist_template_items")
      .delete()
      .in("id", toDelete);
    if (deleteErr) return { success: false, error: deleteErr.message };
  }

  // 3. Update existing items
  const toUpdate = items.filter(
    (i): i is TemplateItemInput & { id: string } => Boolean(i.id)
  );
  for (const item of toUpdate) {
    const { error: updateErr } = await supabase
      .from("checklist_template_items")
      .update({
        label: item.label.trim(),
        description: item.description?.trim() || null,
        sort_order: item.sort_order,
      })
      .eq("id", item.id);
    if (updateErr) return { success: false, error: updateErr.message };
  }

  // 4. Insert new items
  const toInsert = items.filter((i) => !i.id);
  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from("checklist_template_items")
      .insert(
        toInsert.map((i) => ({
          template_id: templateId,
          label: i.label.trim(),
          description: i.description?.trim() || null,
          sort_order: i.sort_order,
        }))
      );
    if (insertErr) return { success: false, error: insertErr.message };
  }

  // 5. Bump the template's updated_at so the list reflects the change.
  await supabase
    .from("checklist_templates")
    .update({ updated_at: nowIso() })
    .eq("id", templateId);

  return { success: true };
}

/**
 * Soft-delete by flipping is_active to false. Past instances keep their
 * references so historical records stay intact.
 */
export async function deleteChecklistTemplate(
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  return updateChecklistTemplate(templateId, { is_active: false });
}

// =============================================================================
// Instance reads + lazy creation
// =============================================================================

/**
 * Returns all checklist instances for the given date (SGT). If no instances
 * exist yet, materialises them lazily from the active templates.
 */
export async function getChecklistsForDate(
  date: string
): Promise<ChecklistInstanceWithItems[]> {
  if (!isSupabaseConfigured()) {
    return getChecklistsForDateMock(date);
  }
  return getChecklistsForDateReal(date);
}

async function getChecklistsForDateMock(
  date: string
): Promise<ChecklistInstanceWithItems[]> {
  const existing = MOCK_CHECKLIST_INSTANCES.filter((i) => i.date === date);

  if (existing.length === 0) {
    // Lazy-create instances from active templates.
    const activeTemplates = MOCK_CHECKLIST_TEMPLATES.filter((t) => t.is_active);
    const now = nowIso();
    for (const template of activeTemplates) {
      const instanceId = randomId("checklist-instance");
      MOCK_CHECKLIST_INSTANCES.push({
        id: instanceId,
        template_id: template.id,
        date,
        completed_at: null,
        completed_by: null,
        created_at: now,
      });
      const templateItems = MOCK_CHECKLIST_TEMPLATE_ITEMS.filter(
        (i) => i.template_id === template.id
      ).sort((a, b) => a.sort_order - b.sort_order);
      for (const item of templateItems) {
        MOCK_CHECKLIST_INSTANCE_ITEMS.push({
          id: randomId("instance-item"),
          instance_id: instanceId,
          template_item_id: item.id,
          label: item.label,
          description: item.description,
          sort_order: item.sort_order,
          checked: false,
          checked_by: null,
          checked_at: null,
          created_at: now,
        });
      }
    }
  }

  const instances = MOCK_CHECKLIST_INSTANCES.filter((i) => i.date === date);
  return instances
    .map((instance) => {
      const template = MOCK_CHECKLIST_TEMPLATES.find(
        (t) => t.id === instance.template_id
      );
      if (!template) return null;
      const items = MOCK_CHECKLIST_INSTANCE_ITEMS.filter(
        (it) => it.instance_id === instance.id
      )
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order);
      return {
        instance,
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
        },
        items,
        completed_by_name: findMockStaffName(instance.completed_by),
      };
    })
    .filter((x): x is ChecklistInstanceWithItems => x !== null)
    .sort((a, b) =>
      (a.template as { name: string }).name.localeCompare(
        (b.template as { name: string }).name
      )
    );
}

async function getChecklistsForDateReal(
  date: string
): Promise<ChecklistInstanceWithItems[]> {
  const supabase = createClient();

  // Fetch existing instances for the date.
  let instances = await fetchInstancesForDate(supabase, date);

  if (instances.length === 0) {
    // Lazy-create from active templates. Uses ON CONFLICT DO NOTHING so a
    // concurrent request that already inserted the row for this date doesn't
    // cause a failure — we just re-fetch afterwards.
    const { data: activeTemplates } = await supabase
      .from("checklist_templates")
      .select("id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const templateRows = (activeTemplates as { id: string }[] | null) ?? [];
    if (templateRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("checklist_instances")
        .upsert(
          templateRows.map((t) => ({ template_id: t.id, date })),
          { onConflict: "template_id,date", ignoreDuplicates: true }
        );

      if (!insertErr) {
        // Fetch the newly-created instances + their template items so we can
        // populate instance_items.
        const freshlyCreated = await fetchInstancesForDate(supabase, date);
        const instanceIds = freshlyCreated.map((r) => r.id);

        // Only seed items for instances that have no items yet (races).
        if (instanceIds.length > 0) {
          const { data: existingItems } = await supabase
            .from("checklist_instance_items")
            .select("instance_id")
            .in("instance_id", instanceIds);

          const instancesWithItems = new Set(
            ((existingItems as { instance_id: string }[] | null) ?? []).map(
              (r) => r.instance_id
            )
          );

          const instancesNeedingItems = freshlyCreated.filter(
            (i) => !instancesWithItems.has(i.id)
          );

          for (const instance of instancesNeedingItems) {
            const { data: templateItems } = await supabase
              .from("checklist_template_items")
              .select("*")
              .eq("template_id", instance.template_id)
              .order("sort_order", { ascending: true });

            const templateItemRows =
              (templateItems as ChecklistTemplateItem[] | null) ?? [];
            if (templateItemRows.length > 0) {
              await supabase.from("checklist_instance_items").insert(
                templateItemRows.map((t) => ({
                  instance_id: instance.id,
                  template_item_id: t.id,
                  label: t.label,
                  description: t.description,
                  sort_order: t.sort_order,
                }))
              );
            }
          }
        }

        instances = freshlyCreated;
      }
    }
  }

  if (instances.length === 0) return [];

  // Fetch items and template metadata in bulk.
  const [itemsResponse, templatesResponse, staffResponse] = await Promise.all([
    supabase
      .from("checklist_instance_items")
      .select("*")
      .in(
        "instance_id",
        instances.map((i) => i.id)
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("checklist_templates")
      .select("id, name, description, category")
      .in(
        "id",
        instances.map((i) => i.template_id)
      ),
    supabase
      .from("staff")
      .select("id, full_name")
      .in(
        "id",
        instances
          .map((i) => i.completed_by)
          .filter((id): id is string => Boolean(id))
      ),
  ]);

  const items =
    (itemsResponse.data as ChecklistInstanceItem[] | null) ?? [];
  const templates =
    (templatesResponse.data as
      | Pick<ChecklistTemplate, "id" | "name" | "description" | "category">[]
      | null) ?? [];
  const staffRows =
    (staffResponse.data as { id: string; full_name: string }[] | null) ?? [];

  return instances
    .map((instance) => {
      const template = templates.find((t) => t.id === instance.template_id);
      if (!template) return null;
      const instanceItems = items.filter(
        (it) => it.instance_id === instance.id
      );
      const completedByName = instance.completed_by
        ? staffRows.find((s) => s.id === instance.completed_by)?.full_name ??
          null
        : null;
      return {
        instance,
        template,
        items: instanceItems,
        completed_by_name: completedByName,
      };
    })
    .filter((x): x is ChecklistInstanceWithItems => x !== null)
    .sort((a, b) => a.template.name.localeCompare(b.template.name));
}

async function fetchInstancesForDate(
  supabase: ReturnType<typeof createClient>,
  date: string
): Promise<ChecklistInstance[]> {
  const { data } = await supabase
    .from("checklist_instances")
    .select("*")
    .eq("date", date);
  return (data as ChecklistInstance[] | null) ?? [];
}

// =============================================================================
// Toggle checklist item
// =============================================================================

export interface ToggleResult {
  success: boolean;
  checked: boolean;
  allComplete: boolean;
  error?: string;
}

/**
 * Flip a single item's checked state. When the flip completes the instance
 * (all items checked), also stamps the instance's completed_at/completed_by.
 * Unchecking a previously-completed instance clears those fields.
 */
export async function toggleChecklistItem(
  itemId: string,
  staffId: string
): Promise<ToggleResult> {
  if (!isSupabaseConfigured()) {
    const item = MOCK_CHECKLIST_INSTANCE_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      return {
        success: false,
        checked: false,
        allComplete: false,
        error: "Item not found",
      };
    }
    const nextChecked = !item.checked;
    const now = nowIso();
    item.checked = nextChecked;
    item.checked_by = nextChecked ? staffId : null;
    item.checked_at = nextChecked ? now : null;

    const siblings = MOCK_CHECKLIST_INSTANCE_ITEMS.filter(
      (i) => i.instance_id === item.instance_id
    );
    const allComplete = siblings.every((i) => i.checked);

    const instance = MOCK_CHECKLIST_INSTANCES.find(
      (i) => i.id === item.instance_id
    );
    if (instance) {
      if (allComplete) {
        instance.completed_at = now;
        instance.completed_by = staffId;
      } else {
        instance.completed_at = null;
        instance.completed_by = null;
      }
    }

    return { success: true, checked: nextChecked, allComplete };
  }

  const supabase = createClient();

  // Fetch current state so we know what to flip to.
  const { data: current, error: fetchErr } = await supabase
    .from("checklist_instance_items")
    .select("id, instance_id, checked")
    .eq("id", itemId)
    .maybeSingle();

  if (fetchErr) {
    return {
      success: false,
      checked: false,
      allComplete: false,
      error: fetchErr.message,
    };
  }
  if (!current) {
    return {
      success: false,
      checked: false,
      allComplete: false,
      error: "Item not found",
    };
  }

  const row = current as {
    id: string;
    instance_id: string;
    checked: boolean;
  };
  const nextChecked = !row.checked;
  const now = nowIso();

  const { error: updateErr } = await supabase
    .from("checklist_instance_items")
    .update({
      checked: nextChecked,
      checked_by: nextChecked ? staffId : null,
      checked_at: nextChecked ? now : null,
    })
    .eq("id", itemId);

  if (updateErr) {
    return {
      success: false,
      checked: row.checked,
      allComplete: false,
      error: updateErr.message,
    };
  }

  // Re-check completion across the whole instance.
  const { data: siblings } = await supabase
    .from("checklist_instance_items")
    .select("checked")
    .eq("instance_id", row.instance_id);

  const allComplete =
    ((siblings as { checked: boolean }[] | null) ?? []).every(
      (s) => s.checked
    );

  await supabase
    .from("checklist_instances")
    .update({
      completed_at: allComplete ? now : null,
      completed_by: allComplete ? staffId : null,
    })
    .eq("id", row.instance_id);

  return { success: true, checked: nextChecked, allComplete };
}

// =============================================================================
// Single-instance items fetch (used by history detail view)
// =============================================================================

export async function getChecklistInstanceItems(
  instanceId: string
): Promise<ChecklistInstanceItem[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_CHECKLIST_INSTANCE_ITEMS.filter(
      (it) => it.instance_id === instanceId
    )
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("checklist_instance_items")
    .select("*")
    .eq("instance_id", instanceId)
    .order("sort_order", { ascending: true });
  return (data as ChecklistInstanceItem[] | null) ?? [];
}

// =============================================================================
// History
// =============================================================================

export interface ChecklistHistoryParams {
  templateId?: string;
  startDate: string;
  endDate: string;
}

export async function getChecklistHistory(
  params: ChecklistHistoryParams
): Promise<ChecklistInstanceSummary[]> {
  if (!isSupabaseConfigured()) {
    const instances = MOCK_CHECKLIST_INSTANCES.filter(
      (i) =>
        i.date >= params.startDate &&
        i.date <= params.endDate &&
        (!params.templateId || i.template_id === params.templateId)
    );

    return instances
      .map((instance) => {
        const template = MOCK_CHECKLIST_TEMPLATES.find(
          (t) => t.id === instance.template_id
        );
        if (!template) return null;
        const items = MOCK_CHECKLIST_INSTANCE_ITEMS.filter(
          (it) => it.instance_id === instance.id
        );
        return {
          instance_id: instance.id,
          template_id: instance.template_id,
          template_name: template.name,
          date: instance.date,
          items_total: items.length,
          items_checked: items.filter((it) => it.checked).length,
          completed_at: instance.completed_at,
          completed_by_name: findMockStaffName(instance.completed_by),
        };
      })
      .filter((s): s is ChecklistInstanceSummary => s !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const supabase = createClient();

  let query = supabase
    .from("checklist_instances")
    .select("*")
    .gte("date", params.startDate)
    .lte("date", params.endDate)
    .order("date", { ascending: false });

  if (params.templateId) {
    query = query.eq("template_id", params.templateId);
  }

  const { data: instanceRows } = await query;
  const instances = (instanceRows as ChecklistInstance[] | null) ?? [];
  if (instances.length === 0) return [];

  const [itemsResp, templatesResp, staffResp] = await Promise.all([
    supabase
      .from("checklist_instance_items")
      .select("instance_id, checked")
      .in(
        "instance_id",
        instances.map((i) => i.id)
      ),
    supabase
      .from("checklist_templates")
      .select("id, name")
      .in(
        "id",
        instances.map((i) => i.template_id)
      ),
    supabase
      .from("staff")
      .select("id, full_name")
      .in(
        "id",
        instances
          .map((i) => i.completed_by)
          .filter((id): id is string => Boolean(id))
      ),
  ]);

  const items =
    (itemsResp.data as { instance_id: string; checked: boolean }[] | null) ??
    [];
  const templates =
    (templatesResp.data as { id: string; name: string }[] | null) ?? [];
  const staffRows =
    (staffResp.data as { id: string; full_name: string }[] | null) ?? [];

  return instances.map((instance) => {
    const template = templates.find((t) => t.id === instance.template_id);
    const matchingItems = items.filter(
      (it) => it.instance_id === instance.id
    );
    return {
      instance_id: instance.id,
      template_id: instance.template_id,
      template_name: template?.name ?? "Unknown",
      date: instance.date,
      items_total: matchingItems.length,
      items_checked: matchingItems.filter((it) => it.checked).length,
      completed_at: instance.completed_at,
      completed_by_name: instance.completed_by
        ? staffRows.find((s) => s.id === instance.completed_by)?.full_name ??
          null
        : null,
    };
  });
}
