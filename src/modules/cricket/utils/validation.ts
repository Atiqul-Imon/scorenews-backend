/**
 * Validation utilities for cricket match operations
 */

/**
 * Validate matchId format
 */
export function isValidMatchId(matchId: any): boolean {
  if (!matchId) return false;
  if (typeof matchId !== 'string' && typeof matchId !== 'number') return false;
  
  const idStr = matchId.toString().trim();
  if (idStr === '' || idStr === 'undefined' || idStr === 'null') return false;
  
  // MatchId should be numeric or alphanumeric
  return /^[a-zA-Z0-9_-]+$/.test(idStr);
}

/**
 * Sanitize matchId
 */
export function sanitizeMatchId(matchId: any): string | null {
  if (!isValidMatchId(matchId)) return null;
  return matchId.toString().trim();
}

/**
 * Validate match data structure
 */
export function validateMatchData(match: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!match) {
    errors.push('Match data is required');
    return { valid: false, errors };
  }

  if (!match.matchId || !isValidMatchId(match.matchId)) {
    errors.push('Valid matchId is required');
  }

  if (!match.teams || !match.teams.home || !match.teams.away) {
    errors.push('Teams data is required');
  }

  if (!match.startTime || !(match.startTime instanceof Date) && isNaN(new Date(match.startTime).getTime())) {
    errors.push('Valid startTime is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate completed match has required result data
 */
export function validateCompletedMatch(match: any): { valid: boolean; errors: string[] } {
  const baseValidation = validateMatchData(match);
  if (!baseValidation.valid) {
    return baseValidation;
  }

  const errors = [...baseValidation.errors];

  if (!match.result) {
    errors.push('Result is required for completed matches');
  } else {
    if (!match.result.winner || !['home', 'away', 'draw'].includes(match.result.winner)) {
      errors.push('Valid result.winner is required');
    }
    if (!match.result.winnerName || typeof match.result.winnerName !== 'string') {
      errors.push('Valid result.winnerName is required');
    }
    if (match.result.margin === undefined || match.result.margin < 0) {
      errors.push('Valid result.margin is required');
    }
    if (!match.result.marginType || !['runs', 'wickets'].includes(match.result.marginType)) {
      errors.push('Valid result.marginType is required');
    }
  }

  if (!match.endTime || (!(match.endTime instanceof Date) && isNaN(new Date(match.endTime).getTime()))) {
    errors.push('Valid endTime is required for completed matches');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}




