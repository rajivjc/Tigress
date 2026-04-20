// Snapshots the initial state of the MOCK_* arrays on first load and exposes
// a `resetMockData()` helper tests can call in beforeEach to roll back any
// mutations made by the module under test.
//
// Because MOCK_BOOKINGS etc have relative timestamps computed at module load
// time, we capture deep clones the first time this helper is imported.

import {
  MOCK_BOOKINGS,
  MOCK_BOOKING_INVITES,
  MOCK_CHECKLIST_INSTANCES,
  MOCK_CHECKLIST_INSTANCE_ITEMS,
  MOCK_CHECKLIST_TEMPLATES,
  MOCK_CHECKLIST_TEMPLATE_ITEMS,
  MOCK_INVITED_BOOKINGS,
  MOCK_MEMBERS,
  MOCK_TIERS,
  MOCK_WALK_IN_GUESTS,
} from "@/lib/data/mock-data";
import type {
  Booking,
  BookingInvite,
  Member,
  MembershipTier,
  WalkInGuest,
} from "@/lib/types";
import type {
  ChecklistTemplate,
  ChecklistTemplateItem,
} from "@/lib/types/checklists";

function clone<T>(arr: T[]): T[] {
  return arr.map((row) => ({ ...row }) as T);
}

const initialBookings: Booking[] = clone(MOCK_BOOKINGS);
const initialInvites: BookingInvite[] = clone(MOCK_BOOKING_INVITES);
const initialInvitedBookings: Booking[] = clone(MOCK_INVITED_BOOKINGS);
const initialMembers: Member[] = clone(MOCK_MEMBERS);
const initialTiers: MembershipTier[] = clone(MOCK_TIERS);
const initialWalkIns: WalkInGuest[] = clone(MOCK_WALK_IN_GUESTS);
const initialChecklistTemplates: ChecklistTemplate[] = clone(
  MOCK_CHECKLIST_TEMPLATES
);
const initialChecklistTemplateItems: ChecklistTemplateItem[] = clone(
  MOCK_CHECKLIST_TEMPLATE_ITEMS
);

function replaceArray<T>(target: T[], source: T[]): void {
  target.length = 0;
  for (const row of source) {
    target.push({ ...row } as T);
  }
}

export function resetMockData(): void {
  replaceArray(MOCK_BOOKINGS, initialBookings);
  replaceArray(MOCK_BOOKING_INVITES, initialInvites);
  replaceArray(MOCK_INVITED_BOOKINGS, initialInvitedBookings);
  replaceArray(MOCK_MEMBERS, initialMembers);
  replaceArray(MOCK_TIERS, initialTiers);
  replaceArray(MOCK_WALK_IN_GUESTS, initialWalkIns);
  replaceArray(MOCK_CHECKLIST_TEMPLATES, initialChecklistTemplates);
  replaceArray(MOCK_CHECKLIST_TEMPLATE_ITEMS, initialChecklistTemplateItems);
  // Lazy-created instances are always cleared — they rebuild on first access.
  MOCK_CHECKLIST_INSTANCES.length = 0;
  MOCK_CHECKLIST_INSTANCE_ITEMS.length = 0;
}
