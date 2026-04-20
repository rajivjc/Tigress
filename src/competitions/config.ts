// =============================================================================
// Competitions — module config (Session 21)
// =============================================================================
// Constants owned by the module. Nothing outside `src/competitions/` should
// import this file.
// =============================================================================

export const MODULE_NAME = "competitions";
export const MODULE_VERSION = "0.1.0";
export const TABLE_PREFIX = "comp_";

/** Default race-to per game type. Mirrors the seeded values in migration 011. */
export const DEFAULT_RACE_TO_BY_GAME_TYPE: Record<string, number> = {
  eight_ball: 5,
  nine_ball: 7,
  ten_ball: 5,
  straight: 75,
  one_pocket: 3,
  bank_pool: 3,
};

export const SKILL_LEVEL_MIN = 1;
export const SKILL_LEVEL_MAX = 10;

/** Race-to range allowed on individual matches (DB CHECK is 1..100). */
export const RACE_TO_MIN = 1;
export const RACE_TO_MAX = 100;

/** Competition name length bounds (DB CHECK is 1..120). */
export const COMPETITION_NAME_MIN = 1;
export const COMPETITION_NAME_MAX = 120;

/** Team name length bounds (DB CHECK is 1..60). */
export const TEAM_NAME_MIN = 1;
export const TEAM_NAME_MAX = 60;

/** Guest display-name bounds (DB CHECK is 1..80). */
export const GUEST_NAME_MIN = 1;
export const GUEST_NAME_MAX = 80;
