/**
 * Enterprise-grade status determination for cricket matches
 * Handles all API inconsistencies and edge cases
 */

export type MatchStatus = 'live' | 'completed' | 'upcoming';

export interface StatusDeterminationResult {
  status: MatchStatus;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Determines match status with high confidence
 * Priority order ensures API inconsistencies are handled correctly
 */
export function determineMatchStatus(apiMatch: any): StatusDeterminationResult {
  const stateId = apiMatch.state_id;
  const statusField = apiMatch.status || '';
  const noteField = apiMatch.note || '';
  const liveField = apiMatch.live;

  // Priority 1: state_id (most reliable when present)
  if (stateId !== undefined) {
    if (stateId === 5 || stateId === 6) {
      return {
        status: 'completed',
        confidence: 'high',
        reason: `state_id=${stateId} (5=finished, 6=abandoned)`,
      };
    }
    if (stateId === 3 || stateId === 4) {
      // But check if status field says otherwise
      if (statusField.includes('Finished') || statusField.includes('Completed')) {
        return {
          status: 'completed',
          confidence: 'high',
          reason: `state_id=${stateId} but status="${statusField}" indicates completion`,
        };
      }
      return {
        status: 'live',
        confidence: 'high',
        reason: `state_id=${stateId} (3=in progress, 4=break)`,
      };
    }
    if (stateId === 1 || stateId === 2) {
      // NOTE: state_id 1 or 2 means "not started" or "starting soon"
      // However, if a match is in the /livescores endpoint, it might be starting imminently
      // The caller (live-match.service) will handle this case specially
      return {
        status: 'upcoming',
        confidence: 'high',
        reason: `state_id=${stateId} (1=not started, 2=starting soon)`,
      };
    }
  }

  // Priority 2: status field (very reliable for completion)
  if (statusField.includes('Finished') || statusField.includes('Completed') || statusField.includes('Result')) {
    return {
      status: 'completed',
      confidence: 'high',
      reason: `status field="${statusField}" indicates completion`,
    };
  }

  // Priority 3: note field (contains result = completed)
  const noteLower = noteField.toLowerCase();
  if (noteLower.includes('won by') || noteLower.includes('tied') || noteLower.includes('no result') || noteLower.includes('abandoned')) {
    return {
      status: 'completed',
      confidence: 'high',
      reason: `note field contains result: "${noteField.substring(0, 50)}"`,
    };
  }

  // Priority 4: status field for live indicators
  // Check for various live status indicators (case insensitive)
  const statusLower = statusField.toLowerCase();
  if (statusLower.includes('innings') || 
      statusLower.includes('live') || 
      statusLower.includes('in progress') ||
      statusLower.includes('st innings') ||
      statusLower.includes('nd innings') ||
      statusLower.includes('rd innings') ||
      statusLower.includes('th innings')) {
    return {
      status: 'live',
      confidence: 'high', // Changed to high - "1st Innings", "2nd Innings" are definitive live indicators
      reason: `status field="${statusField}" indicates live match in progress`,
    };
  }

  // Priority 5: live field (least reliable - can be inconsistent)
  if (liveField === true) {
    // Double-check: if status says finished, trust status over live field
    if (statusField.includes('Finished') || statusField.includes('Completed')) {
      return {
        status: 'completed',
        confidence: 'high',
        reason: `live=true but status="${statusField}" indicates completion (API inconsistency handled)`,
      };
    }
    return {
      status: 'live',
      confidence: 'medium',
      reason: 'live field is true',
    };
  }

  // Priority 6: Check by time and score data
  if (apiMatch.starting_at) {
    const startTime = new Date(apiMatch.starting_at);
    const now = new Date();
    
    if (startTime > now) {
      return {
        status: 'upcoming',
        confidence: 'high',
        reason: `Match starts at ${startTime.toISOString()} (future)`,
      };
    }

    // Match has started - check for score data
    const hasScoreData = apiMatch.scoreboards?.length > 0 || 
                        (apiMatch.localteam && apiMatch.visitorteam);
    
    if (hasScoreData) {
      return {
        status: 'live',
        confidence: 'medium',
        reason: 'Match has started and has score data',
      };
    }
  }

  // Default: upcoming
  return {
    status: 'upcoming',
    confidence: 'low',
    reason: 'Default: no clear indicators, assuming upcoming',
  };
}

/**
 * Check if match is definitely completed (high confidence)
 */
export function isCompleted(apiMatch: any): boolean {
  const result = determineMatchStatus(apiMatch);
  return result.status === 'completed' && result.confidence === 'high';
}

/**
 * Check if match is definitely live (high confidence)
 */
export function isLive(apiMatch: any): boolean {
  const result = determineMatchStatus(apiMatch);
  return result.status === 'live' && result.confidence === 'high';
}



