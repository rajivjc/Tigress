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
  MOCK_POSTS,
  MOCK_POST_LIKES,
  MOCK_RECIPES,
  MOCK_RECIPE_INGREDIENTS,
  MOCK_RECIPE_STEPS,
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
import type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from "@/lib/types/recipes";
import type { PostLikeRow, PostRow } from "@/lib/types/posts";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_GAME_TYPES,
  MOCK_COMP_GUESTS,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_RESULTS,
  MOCK_COMP_PLAYER_SKILLS,
  MOCK_COMP_TEAMS,
  MOCK_COMP_TEAM_MEMBERS,
} from "@/competitions/data/mock-data";
import type {
  Competition,
  CompetitionEntrant,
  CompetitionGuest,
  GameType,
  Match,
  MatchResult,
  PlayerSkill,
  Team,
  TeamMember,
} from "@/competitions/types";

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
const initialRecipes: Recipe[] = clone(MOCK_RECIPES);
const initialRecipeIngredients: RecipeIngredient[] = clone(
  MOCK_RECIPE_INGREDIENTS
);
const initialRecipeSteps: RecipeStep[] = clone(MOCK_RECIPE_STEPS);
const initialPosts: PostRow[] = clone(MOCK_POSTS);
const initialPostLikes: PostLikeRow[] = clone(MOCK_POST_LIKES);
const initialCompGameTypes: GameType[] = clone(MOCK_COMP_GAME_TYPES);
const initialCompPlayerSkills: PlayerSkill[] = clone(MOCK_COMP_PLAYER_SKILLS);
const initialCompGuests: CompetitionGuest[] = clone(MOCK_COMP_GUESTS);
const initialCompTeams: Team[] = clone(MOCK_COMP_TEAMS);
const initialCompTeamMembers: TeamMember[] = clone(MOCK_COMP_TEAM_MEMBERS);
const initialCompCompetitions: Competition[] = clone(MOCK_COMP_COMPETITIONS);
const initialCompEntrants: CompetitionEntrant[] = clone(MOCK_COMP_ENTRANTS);
const initialCompMatches: Match[] = clone(MOCK_COMP_MATCHES);
const initialCompMatchResults: MatchResult[] = clone(MOCK_COMP_MATCH_RESULTS);

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
  replaceArray(MOCK_RECIPES, initialRecipes);
  replaceArray(MOCK_RECIPE_INGREDIENTS, initialRecipeIngredients);
  replaceArray(MOCK_RECIPE_STEPS, initialRecipeSteps);
  replaceArray(MOCK_POSTS, initialPosts);
  replaceArray(MOCK_POST_LIKES, initialPostLikes);
  replaceArray(MOCK_COMP_GAME_TYPES, initialCompGameTypes);
  replaceArray(MOCK_COMP_PLAYER_SKILLS, initialCompPlayerSkills);
  replaceArray(MOCK_COMP_GUESTS, initialCompGuests);
  replaceArray(MOCK_COMP_TEAMS, initialCompTeams);
  replaceArray(MOCK_COMP_TEAM_MEMBERS, initialCompTeamMembers);
  replaceArray(MOCK_COMP_COMPETITIONS, initialCompCompetitions);
  replaceArray(MOCK_COMP_ENTRANTS, initialCompEntrants);
  replaceArray(MOCK_COMP_MATCHES, initialCompMatches);
  replaceArray(MOCK_COMP_MATCH_RESULTS, initialCompMatchResults);
  // Lazy-created instances are always cleared — they rebuild on first access.
  MOCK_CHECKLIST_INSTANCES.length = 0;
  MOCK_CHECKLIST_INSTANCE_ITEMS.length = 0;
}
