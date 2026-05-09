// =============================================================================
// Scheduling — swap eligibility (Session 26)
// =============================================================================
// Pure function: given a candidate shift and the bag of bookkeeping rows,
// return the staff who could cover it. Mirrors assignUserToShiftAction's
// eligibility checks (qualification + availability + no same-day overlap)
// so the swap UI can show only viable targets without duplicating the
// validation logic.
//
// Same shape as assignUserToShiftAction's checks, plus we exclude the
// requester themselves and any user without a matching qualification.
// =============================================================================

import type {
  AvailabilityBlock,
  FtAssignment,
  ScheduleShift,
  UserQualification,
} from "../types";
import {
  isUserAvailableForShift,
  timeRangesOverlap,
  type EmploymentType,
} from "./availability-check";

export interface StaffSummary {
  id: string;
  full_name: string;
  employment_type: EmploymentType;
}

interface EligibilityInput {
  shift: ScheduleShift;
  requesterId: string;
  allStaff: StaffSummary[];
  qualifications: UserQualification[];
  ftAssignments: FtAssignment[];
  /** Availability blocks for the shift's week. Keyed by user_id. */
  availabilityByUser: Map<string, AvailabilityBlock[]>;
  /** Existing same-day shifts already assigned, keyed by user_id. */
  sameDayShiftsByUser: Map<string, ScheduleShift[]>;
}

/**
 * Returns the subset of `allStaff` who are qualified, available, and have
 * no same-day overlap with the candidate shift. The requester themselves
 * is always excluded — they're trying to give the shift away, not take
 * their own back.
 */
export function getEligibleSwapTargets(
  input: EligibilityInput
): StaffSummary[] {
  const qualsByUser = new Map<string, Set<string>>();
  for (const q of input.qualifications) {
    const set = qualsByUser.get(q.user_id) ?? new Set<string>();
    set.add(q.qualification);
    qualsByUser.set(q.user_id, set);
  }

  const ftByUser = new Map<string, FtAssignment[]>();
  for (const fa of input.ftAssignments) {
    const list = ftByUser.get(fa.user_id) ?? [];
    list.push(fa);
    ftByUser.set(fa.user_id, list);
  }

  const out: StaffSummary[] = [];
  for (const candidate of input.allStaff) {
    if (candidate.id === input.requesterId) continue;

    const userQuals = qualsByUser.get(candidate.id);
    if (!userQuals || !userQuals.has(input.shift.role)) continue;

    const availability = input.availabilityByUser.get(candidate.id) ?? [];
    const ftAssignments = ftByUser.get(candidate.id) ?? [];

    const check = isUserAvailableForShift({
      user_employment_type: candidate.employment_type,
      shift: {
        shift_date: input.shift.shift_date,
        template_id: input.shift.template_id,
        start_time: input.shift.start_time,
        end_time: input.shift.end_time,
      },
      availabilityBlocks: availability,
      ftAssignments,
    });
    if (!check.ok) continue;

    const sameDay = input.sameDayShiftsByUser.get(candidate.id) ?? [];
    const overlap = sameDay.some(
      (other) =>
        other.id !== input.shift.id &&
        timeRangesOverlap(
          input.shift.start_time,
          input.shift.end_time,
          other.start_time,
          other.end_time
        )
    );
    if (overlap) continue;

    out.push(candidate);
  }
  return out;
}
