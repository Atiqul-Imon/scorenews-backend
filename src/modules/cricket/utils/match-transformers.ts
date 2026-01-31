import { determineMatchStatus } from './status-determiner';

/**
 * Extract player name from various possible API response structures
 * Checks multiple locations where player data might be stored
 * SportsMonks v2.0 API can return player data in different formats:
 * - Direct object: { fullname: "...", firstname: "...", lastname: "..." }
 * - Nested in data: { data: { fullname: "..." } }
 * - As resource object: { resource: "players", id: 123, fullname: "..." }
 */
function extractPlayerName(playerData: any, playerId?: any): string | undefined {
  // CRITICAL: Do not use placeholder values. If API doesn't provide player name, return undefined.
  if (!playerData && !playerId) {
    return undefined;
  }

  // If playerData is a string, use it directly
  if (typeof playerData === 'string' && playerData.trim()) {
    return playerData.trim();
  }

  // If playerData is an object, check various possible fields
  if (typeof playerData === 'object' && playerData !== null) {
    // Check for nested data structure (API might return { data: { ... } })
    const actualData = playerData.data || playerData;
    
    // Try common field names for player names (SportsMonks v2.0 format)
    // Priority: fullname > full_name > name > firstname+lastname > first_name+last_name
    let name = actualData.fullname || 
               actualData.full_name || 
               actualData.name;
    
    // If no direct name field, try combining firstname and lastname
    if (!name) {
      if (actualData.firstname && actualData.lastname) {
        name = `${actualData.firstname} ${actualData.lastname}`;
      } else if (actualData.first_name && actualData.last_name) {
        name = `${actualData.first_name} ${actualData.last_name}`;
      } else if (actualData.firstname) {
        name = actualData.firstname;
      } else if (actualData.first_name) {
        name = actualData.first_name;
      }
    }
    
    if (name && typeof name === 'string' && name.trim()) {
      return name.trim();
    }
    
    // Log for debugging if we have player data but no name
    if (process.env.NODE_ENV === 'development' && playerId) {
      console.warn(`[extractPlayerName] Player ${playerId} data structure:`, Object.keys(actualData));
    }
  }

  // CRITICAL: Do not use placeholder values like "Player {id}" or "Unknown Player"
  // If API doesn't provide player name, return undefined
  // The frontend should handle missing player names appropriately
  return undefined;
}

/**
 * Parse match result from SportsMonks API's note field
 * Extracts winner, margin, and margin type from the official result text
 * 
 * @param note - The result note from API (e.g., "South Africa won by 7 wickets (with 15 balls remaining)")
 * @param winnerTeamId - The winner team ID from API
 * @param localteamId - Local team ID
 * @param visitorteamId - Visitor team ID
 * @param teams - Teams object with home/away names
 * @returns Parsed result object or undefined if parsing fails
 */
export function parseApiResultNote(
  note: string,
  winnerTeamId: number | string,
  localteamId: number | string,
  visitorteamId: number | string,
  teams: any
): any | undefined {
  try {
    if (!note || !winnerTeamId) {
      return undefined;
    }

    // Determine winner from winner_team_id
    const winnerIsHome = winnerTeamId.toString() === localteamId.toString();
    const winner = winnerIsHome ? 'home' : 'away';
    const winnerName = winnerIsHome ? teams.home.name : teams.away.name;

    // Parse the note to extract margin and margin type
    // Examples:
    // "South Africa won by 7 wickets (with 15 balls remaining)"
    // "West Indies won by 47 runs"
    // "Match tied"
    // "No result"
    // "Match abandoned"

    const noteLower = note.toLowerCase().trim();

    // Check for draw/tie/no result
    if (noteLower.includes('tied') || noteLower.includes('tie')) {
      return {
        winner: 'draw',
        winnerName: 'Match Tied',
        margin: 0,
        marginType: 'runs' as const,
        resultText: 'Match Tied',
        dataSource: 'api',
      };
    }

    if (noteLower.includes('no result') || noteLower.includes('abandoned') || noteLower.includes('cancelled')) {
      return {
        winner: 'draw',
        winnerName: 'No Result',
        margin: 0,
        marginType: 'runs' as const,
        resultText: note.trim(),
        dataSource: 'api',
      };
    }

    // Extract margin and type from patterns like:
    // "won by X runs"
    // "won by X wickets"
    // "won by X wicket" (singular)
    const runsMatch = note.match(/won by (\d+)\s+runs?/i);
    const wicketsMatch = note.match(/won by (\d+)\s+wickets?/i);

    let margin = 0;
    let marginType: 'runs' | 'wickets' = 'runs';
    let resultText = note.trim();

    if (runsMatch) {
      margin = parseInt(runsMatch[1], 10);
      marginType = 'runs';
      resultText = `${winnerName} won by ${margin} runs`;
    } else if (wicketsMatch) {
      margin = parseInt(wicketsMatch[1], 10);
      marginType = 'wickets';
      resultText = `${winnerName} won by ${margin} wicket${margin !== 1 ? 's' : ''}`;
    } else {
      // If we can't parse margin, use the note as-is but still set winner
      resultText = note.trim();
      margin = 0;
      marginType = 'runs';
    }

    return {
      winner,
      winnerName,
      margin,
      marginType,
      resultText,
      dataSource: 'api',
    };
  } catch (error) {
    console.error('[Transformer] Error parsing API result note:', error);
    return undefined;
  }
}

/**
 * @deprecated This function is no longer used.
 * All match results MUST come from the SportsMonks API (via parseApiResultNote).
 * Local calculation of results is strictly forbidden to ensure highest accuracy.
 * This function is kept only for reference and should never be called.
 */
export function calculateMatchResult(
  currentScore: any,
  scores: any[],
  teams: any,
  localteamId: any,
  visitorteamId: any,
  isV2Format: boolean,
  winnerTeamId?: any
): any {
  // CRITICAL: This function should NEVER be called.
  // All results must come from API via parseApiResultNote.
  throw new Error('calculateMatchResult is deprecated. All results must come from SportsMonks API.');
}

export function transformApiMatchToFrontend(apiMatch: any): any {
  const teams = apiMatch.teams || apiMatch.teamInfo || [];
  const homeTeam = teams[0] || {};
  const awayTeam = teams[1] || {};

  const scores = apiMatch.score || [];
  const homeScore = scores[0] || {};
  const awayScore = scores[1] || {};

  let status: 'live' | 'completed' | 'upcoming' | 'cancelled' = 'upcoming';
  if (apiMatch.matchStarted && apiMatch.matchEnded) {
    status = 'completed';
  } else if (apiMatch.matchStarted && !apiMatch.matchEnded) {
    status = 'live';
  }

  const formatMap: Record<string, string> = {
    test: 'test',
    odi: 'odi',
    t20i: 't20i',
    t20: 't20',
    'first-class': 'first-class',
    'list-a': 'list-a',
  };
  const format = formatMap[apiMatch.matchType?.toLowerCase()] || 't20';

  // CRITICAL: Only use API-provided venue data. Do not use placeholder values.
  let venue: { name?: string; city?: string; country?: string } | undefined = undefined;
  if (apiMatch.venue) {
    const venueParts = apiMatch.venue.split(',').map((p: string) => p.trim());
    venue = {
      name: venueParts[0] || undefined,
      city: venueParts[1] || venueParts[0] || undefined,
      country: venueParts[2] || venueParts[1] || undefined,
    };
    // If no valid venue data, set to undefined
    if (!venue.name && !venue.city && !venue.country) {
      venue = undefined;
    }
  }

  return {
    _id: apiMatch.id || apiMatch.matchId,
    matchId: apiMatch.id || apiMatch.matchId,
    name: apiMatch.name || `${homeTeam.name || teams[0]} vs ${awayTeam.name || teams[1]}`,
    teams: {
      home: {
        // CRITICAL: Only use API-provided team data. Do not use placeholder values like 'Team 1'.
        id: homeTeam.id || homeTeam.team_id?.toString() || homeTeam.name || teams[0]?.id || teams[0]?.team_id?.toString() || undefined,
        name: homeTeam.name || teams[0]?.name || undefined,
        flag: homeTeam.image_path || homeTeam.flag || teams[0]?.image_path || teams[0]?.flag || undefined,
        shortName: homeTeam.shortname || homeTeam.shortName || teams[0]?.shortname || teams[0]?.shortName || undefined,
      },
      away: {
        // CRITICAL: Only use API-provided team data. Do not use placeholder values like 'Team 2'.
        id: awayTeam.id || awayTeam.team_id?.toString() || awayTeam.name || teams[1]?.id || teams[1]?.team_id?.toString() || undefined,
        name: awayTeam.name || teams[1]?.name || undefined,
        flag: awayTeam.image_path || awayTeam.flag || teams[1]?.image_path || teams[1]?.flag || undefined,
        shortName: awayTeam.shortname || awayTeam.shortName || teams[1]?.shortname || teams[1]?.shortName || undefined,
      },
    },
    venue,
    status,
    format,
    startTime: apiMatch.dateTimeGMT ? new Date(apiMatch.dateTimeGMT) : apiMatch.date ? new Date(apiMatch.date) : new Date(),
    // CRITICAL: Only use API-provided score data. Do not calculate balls from overs.
    currentScore: scores.length > 0
      ? {
          home: {
            runs: homeScore.r !== undefined && homeScore.r !== null ? homeScore.r : undefined,
            wickets: homeScore.w !== undefined && homeScore.w !== null ? homeScore.w : undefined,
            overs: homeScore.o !== undefined && homeScore.o !== null ? parseFloat(homeScore.o.toString()) : undefined,
            // CRITICAL: Only use API-provided balls. Do not calculate from overs.
            balls: homeScore.b !== undefined && homeScore.b !== null ? homeScore.b : undefined,
          },
          away: {
            runs: awayScore.r !== undefined && awayScore.r !== null ? awayScore.r : undefined,
            wickets: awayScore.w !== undefined && awayScore.w !== null ? awayScore.w : undefined,
            overs: awayScore.o !== undefined && awayScore.o !== null ? parseFloat(awayScore.o.toString()) : undefined,
            // CRITICAL: Only use API-provided balls. Do not calculate from overs.
            balls: awayScore.b !== undefined && awayScore.b !== null ? awayScore.b : undefined,
          },
        }
      : undefined,
    matchStarted: apiMatch.matchStarted,
    matchEnded: apiMatch.matchEnded,
    detailUrl: `/cricket/match/${apiMatch.id || apiMatch.matchId}`,
  };
}

export function transformSportsMonksMatchToFrontend(apiMatch: any, sport: 'cricket' | 'football' = 'cricket'): any {
  // Handle v2.0 API format (cricket) vs v3 API format (football)
  // v2.0 format is identified by presence of localteam_id/visitorteam_id (even if nested objects aren't included)
  const isV2Format = sport === 'cricket' && (apiMatch.localteam_id !== undefined || apiMatch.visitorteam_id !== undefined);
  
  let homeParticipant: any = {};
  let awayParticipant: any = {};
  let scores: any[] = [];
  
  if (isV2Format) {
    // v2.0 format: localteam, visitorteam, scoreboards
    // NOTE: These may not be included in response even with include parameter
    // If not included, we'll use IDs and fetch separately or construct from IDs
    homeParticipant = apiMatch.localteam || { id: apiMatch.localteam_id };
    awayParticipant = apiMatch.visitorteam || { id: apiMatch.visitorteam_id };
    scores = apiMatch.scoreboards || [];
  } else {
    // v3 format: participants, scores
    const participants = apiMatch.participants || [];
    homeParticipant = participants.find((p: any) => p.meta?.location === 'home') || participants[0] || {};
    awayParticipant = participants.find((p: any) => p.meta?.location === 'away') || participants[1] || {};
    scores = apiMatch.scores || [];
  }

  // v2.0: scoreboards have scoreboard field (S1, S2) and team_id
  // v3: scores have scoreboard field (1, 2) and participant_id
  let homeScore: any = {};
  let awayScore: any = {};
  
  // Store team IDs for later use
  const localteamId = isV2Format ? apiMatch.localteam_id : undefined;
  const visitorteamId = isV2Format ? apiMatch.visitorteam_id : undefined;
  
  if (isV2Format) {
    // v2.0: Find latest scores by team_id matching localteam_id/visitorteam_id
    // Scoreboards can have multiple entries per team (innings), get the latest one
    // IMPORTANT: Filter by type='total' to get actual scores, not 'extra' type which has total:0
    
    // Get all scores for each team, prefer 'total' type over 'extra' type
    const homeScores = scores.filter((s: any) => 
      s.team_id === localteamId && 
      s.team_id !== undefined &&
      s.type === 'total' // Only use 'total' type scoreboards, not 'extra'
    );
    const awayScores = scores.filter((s: any) => 
      s.team_id === visitorteamId && 
      s.team_id !== undefined &&
      s.type === 'total' // Only use 'total' type scoreboards, not 'extra'
    );
    
    // If no 'total' type found, fall back to any scoreboard (for backward compatibility)
    const homeScoresFallback = scores.filter((s: any) => s.team_id === localteamId && s.team_id !== undefined);
    const awayScoresFallback = scores.filter((s: any) => s.team_id === visitorteamId && s.team_id !== undefined);
    
    // Get the latest score (highest overs or most recent) for each team
    if (homeScores.length > 0) {
      homeScore = homeScores.reduce((latest: any, current: any) => {
        const latestOvers = parseFloat(latest.overs?.toString() || '0');
        const currentOvers = parseFloat(current.overs?.toString() || '0');
        return currentOvers > latestOvers ? current : latest;
      }, homeScores[0]);
    } else if (homeScoresFallback.length > 0) {
      // Fallback: use any scoreboard if no 'total' type found
      homeScore = homeScoresFallback.reduce((latest: any, current: any) => {
        const latestOvers = parseFloat(latest.overs?.toString() || '0');
        const currentOvers = parseFloat(current.overs?.toString() || '0');
        return currentOvers > latestOvers ? current : latest;
      }, homeScoresFallback[0]);
    } else {
      // Fallback: Try to find by scoreboard S1, but verify team_id matches
      const s1Score = scores.find((s: any) => s.scoreboard === 'S1');
      if (s1Score && s1Score.team_id === localteamId) {
        homeScore = s1Score;
      } else if (s1Score && s1Score.team_id !== visitorteamId) {
        // If S1 exists and doesn't belong to away team, use it for home
        homeScore = s1Score;
      } else {
        // Find first score that doesn't belong to away team
        const nonAwayScore = scores.find((s: any) => s.team_id !== visitorteamId && s.team_id !== undefined);
        homeScore = nonAwayScore || scores[0] || {};
      }
    }
    
    if (awayScores.length > 0) {
      awayScore = awayScores.reduce((latest: any, current: any) => {
        const latestOvers = parseFloat(latest.overs?.toString() || '0');
        const currentOvers = parseFloat(current.overs?.toString() || '0');
        return currentOvers > latestOvers ? current : latest;
      }, awayScores[0]);
    } else if (awayScoresFallback.length > 0) {
      // Fallback: use any scoreboard if no 'total' type found
      awayScore = awayScoresFallback.reduce((latest: any, current: any) => {
        const latestOvers = parseFloat(latest.overs?.toString() || '0');
        const currentOvers = parseFloat(current.overs?.toString() || '0');
        return currentOvers > latestOvers ? current : latest;
      }, awayScoresFallback[0]);
    } else {
      // Fallback: Try to find by scoreboard S2, but verify team_id matches
      const s2Score = scores.find((s: any) => s.scoreboard === 'S2');
      if (s2Score && s2Score.team_id === visitorteamId) {
        awayScore = s2Score;
      } else if (s2Score && s2Score.team_id !== localteamId) {
        // If S2 exists and doesn't belong to home team, use it for away
        awayScore = s2Score;
      } else {
        // Find first score that doesn't belong to home team
        const nonHomeScore = scores.find((s: any) => s.team_id !== localteamId && s.team_id !== undefined);
        awayScore = nonHomeScore || (scores.length > 1 ? scores[1] : {});
      }
    }
    
    // CRITICAL: Ensure homeScore and awayScore are from different teams
    // If they're the same, we need to fix it before proceeding
    if (homeScore.team_id === awayScore.team_id && homeScore.team_id !== undefined && scores.length > 1) {
      // Find scores for the missing team
      if (homeScore.team_id === localteamId) {
        // homeScore is correct, find awayScore
        const correctAwayScore = scores.find((s: any) => s.team_id === visitorteamId && s.team_id !== localteamId);
        if (correctAwayScore) {
          awayScore = correctAwayScore;
        } else {
          // If no away score exists yet (only first innings), set awayScore to empty/default
          awayScore = {
            team_id: visitorteamId,
            total: 0,
            wickets: 0,
            overs: 0,
            scoreboard: 'S2'
          };
        }
      } else if (homeScore.team_id === visitorteamId) {
        // homeScore is actually away team's score, swap
        const correctHomeScore = scores.find((s: any) => s.team_id === localteamId && s.team_id !== visitorteamId);
        if (correctHomeScore) {
          const temp = homeScore;
          homeScore = correctHomeScore;
          awayScore = temp;
        } else {
          // If no home score exists yet, set homeScore to empty/default
          const temp = homeScore;
          homeScore = {
            team_id: localteamId,
            total: 0,
            wickets: 0,
            overs: 0,
            scoreboard: 'S1'
          };
          awayScore = temp;
        }
      }
    }
    
    // Final validation: Log if there are still issues (should be rare after above fixes)
    if (homeScore.team_id === awayScore.team_id && homeScore.team_id !== undefined && scores.length > 1) {
      console.warn('[Transformer] WARNING: homeScore and awayScore still have same team_id after fixes!', {
        homeScoreTeamId: homeScore.team_id,
        awayScoreTeamId: awayScore.team_id,
        localteamId,
        visitorteamId,
        scoresCount: scores.length,
        scoreboards: scores.map((s: any) => ({ scoreboard: s.scoreboard, team_id: s.team_id, total: s.total, overs: s.overs }))
      });
    }
    
    // Final validation: Log the final assignment for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Transformer] Final score assignment:', {
        homeScore: {
          team_id: homeScore.team_id,
          scoreboard: homeScore.scoreboard,
          total: homeScore.total,
          runs: homeScore.score,
          overs: homeScore.overs,
          wickets: homeScore.wickets
        },
        awayScore: {
          team_id: awayScore.team_id,
          scoreboard: awayScore.scoreboard,
          total: awayScore.total,
          runs: awayScore.score,
          overs: awayScore.overs,
          wickets: awayScore.wickets
        },
        localteamId,
        visitorteamId
      });
    }
  } else {
    // v3: Find scores by participant_id or scoreboard
    homeScore = scores.find((s: any) => s.scoreboard === '1' || s.participant_id === homeParticipant.id) || scores[0] || {};
    awayScore = scores.find((s: any) => s.scoreboard === '2' || s.participant_id === awayParticipant.id) || scores[1] || {};
    
    // Additional validation for v3
    if (homeScore.participant_id === awayScore.participant_id && homeScore.participant_id !== undefined) {
      console.warn('[Transformer] Warning: homeScore and awayScore have same participant_id, attempting to fix...');
      if (homeScore.participant_id === homeParticipant.id) {
        const correctAwayScore = scores.find((s: any) => s.participant_id === awayParticipant.id && s.participant_id !== homeParticipant.id);
        if (correctAwayScore) awayScore = correctAwayScore;
      } else {
        const correctHomeScore = scores.find((s: any) => s.participant_id === homeParticipant.id && s.participant_id !== awayParticipant.id);
        if (correctHomeScore) {
          const temp = homeScore;
          homeScore = correctHomeScore;
          awayScore = temp;
        }
      }
    }
  }

  let status: 'live' | 'completed' | 'upcoming' | 'cancelled' = 'upcoming';
  
  // All SportsMonks API calls are v2.0 format
  // Use enterprise-grade status determination
  const statusResult = determineMatchStatus(apiMatch);
  status = statusResult.status;
  
  // Log status determination for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Transformer] Match ${apiMatch.id} status: ${status} (${statusResult.confidence}) - ${statusResult.reason}`);
  }

  // Additional check: If match appears live but both innings are complete, mark as completed
  // This handles cases where state_id might be 3/4 but the match has actually finished
  // IMPORTANT: Only mark as completed if BOTH teams have finished their innings
  if (status === 'live' && scores.length >= 2 && homeScore.team_id && awayScore.team_id) {
    // Determine max overs based on format
    const matchType = (apiMatch.type || '').toLowerCase();
    const isT20 = matchType.includes('t20');
    const isODI = matchType.includes('odi');
    const maxOvers = isT20 ? 20 : isODI ? 50 : undefined;
    
    // Check if HOME team has completed their innings
    const homeOvers = parseFloat(homeScore.overs?.toString() || '0');
    const homeWickets = homeScore.wickets || 0;
    const homeAllOut = homeWickets >= 10;
    const homeReachedMaxOvers = maxOvers !== undefined && homeOvers >= maxOvers;
    const homeInningsComplete = homeAllOut || homeReachedMaxOvers;
    
    // Check if AWAY team has completed their innings
    const awayOvers = parseFloat(awayScore.overs?.toString() || '0');
    const awayWickets = awayScore.wickets || 0;
    const awayAllOut = awayWickets >= 10;
    const awayReachedMaxOvers = maxOvers !== undefined && awayOvers >= maxOvers;
    const awayInningsComplete = awayAllOut || awayReachedMaxOvers;
    
    // Only mark as completed if BOTH teams have completed their innings
    const bothInningsComplete = homeInningsComplete && awayInningsComplete;
    
    // Also check if there are no active batters (all out or innings ended)
    const hasActiveBatters = apiMatch.batting && Array.isArray(apiMatch.batting) 
      ? apiMatch.batting.some((b: any) => b.active === true && !b.batsmanout_id)
      : false;
    
    // If both innings are complete and no active batters, mark as completed
    if (bothInningsComplete && !hasActiveBatters) {
      console.log('[Transformer] Match marked as completed: both innings complete, no active batters', {
        homeInningsComplete,
        awayInningsComplete,
        homeOvers,
        homeWickets,
        awayOvers,
        awayWickets
      });
      status = 'completed';
    } else {
      // Log why match is still live
      if (process.env.NODE_ENV === 'development') {
        console.log('[Transformer] Match still live:', {
          homeInningsComplete,
          awayInningsComplete,
          hasActiveBatters,
          homeOvers,
          homeWickets,
          awayOvers,
          awayWickets
        });
      }
    }
  }

  // v2.0: venue is an object with name, city, country_id
  // v3: venue is an object with name, city, country
  let venueData: any = {
    name: 'Unknown Venue',
    city: 'Unknown',
    country: 'Unknown',
  };
  
  if (isV2Format) {
    // v2.0: venue is an object with name, city, country_id (not country)
    if (apiMatch.venue && typeof apiMatch.venue === 'object' && apiMatch.venue.name) {
      venueData = {
        name: apiMatch.venue.name || 'Unknown Venue',
        city: apiMatch.venue.city || 'Unknown',
        // v2.0 doesn't have country field, only country_id
        // Use city as fallback for country display
        country: apiMatch.venue.country || apiMatch.venue.city || 'Unknown',
      };
    } else if (typeof apiMatch.venue === 'string') {
      // Fallback: if venue is a string (shouldn't happen with v2.0)
      venueData.name = apiMatch.venue;
      venueData.city = apiMatch.venue;
    } else {
      // No venue data available - log for debugging
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Transformer] No venue data for match ${apiMatch.id}:`, apiMatch.venue);
      }
    }
  } else {
    // v3: venue is always an object
    const venue = apiMatch.venue || {};
    venueData = {
      name: venue.name || 'Unknown Venue',
      city: venue.city || 'Unknown',
      country: venue.country || 'Unknown',
    };
  }

  let format: string = 't20';
  if (sport === 'cricket') {
    if (isV2Format) {
      // v2.0 format: use type field directly
      const matchType = (apiMatch.type || '').toLowerCase();
      if (matchType.includes('test')) format = 'test';
      else if (matchType.includes('odi')) format = 'odi';
      else if (matchType.includes('t20')) format = 't20i';
      else format = 't20';
    } else {
      // v3 format: use type_id
      const typeId = apiMatch.type_id;
      if (typeId === 1) format = 'test';
      else if (typeId === 2) format = 'odi';
      else if (typeId === 3) format = 't20';
    }
  }

  // Extract team names - v2.0 can have teams as strings or objects
  let homeTeamName = 'Team 1';
  let awayTeamName = 'Team 2';
  let homeTeamShortName = 'T1';
  let awayTeamShortName = 'T2';
  
  if (isV2Format) {
    // v2.0: teams are objects with name, code properties
    // BUT: If include parameter doesn't return nested data, we only have IDs
    // In that case, we need to construct team names from IDs or use fallback
    if (apiMatch.localteam && typeof apiMatch.localteam === 'object' && apiMatch.localteam.name) {
      homeTeamName = apiMatch.localteam.name;
      homeTeamShortName = apiMatch.localteam.code || apiMatch.localteam.short_name || homeTeamName.substring(0, 3).toUpperCase();
    } else {
      // Nested data not included - use fallback names (will be updated when full details fetched)
      homeTeamName = `Team ${apiMatch.localteam_id || '1'}`;
      homeTeamShortName = `T${apiMatch.localteam_id || '1'}`;
    }
    
    if (apiMatch.visitorteam && typeof apiMatch.visitorteam === 'object' && apiMatch.visitorteam.name) {
      awayTeamName = apiMatch.visitorteam.name;
      awayTeamShortName = apiMatch.visitorteam.code || apiMatch.visitorteam.short_name || awayTeamName.substring(0, 3).toUpperCase();
    } else {
      // Nested data not included - use fallback names (will be updated when full details fetched)
      awayTeamName = `Team ${apiMatch.visitorteam_id || '2'}`;
      awayTeamShortName = `T${apiMatch.visitorteam_id || '2'}`;
    }
  } else {
    // v3: teams from participants
    homeTeamName = homeParticipant.name || 'Team 1';
    awayTeamName = awayParticipant.name || 'Team 2';
    homeTeamShortName = homeParticipant.short_code || homeTeamName.substring(0, 3).toUpperCase();
    awayTeamShortName = awayParticipant.short_code || awayTeamName.substring(0, 3).toUpperCase();
  }

  const teams = {
    home: {
      id: (isV2Format ? apiMatch.localteam_id : homeParticipant.id)?.toString() || '',
      name: homeTeamName,
      flag: '🏏',
      shortName: homeTeamShortName,
    },
    away: {
      id: (isV2Format ? apiMatch.visitorteam_id : awayParticipant.id)?.toString() || '',
      name: awayTeamName,
      flag: '🏏',
      shortName: awayTeamShortName,
    },
  };

  let currentScore: any = undefined;
  // For v2.0, also check if live field is true even if status is not set yet
  const isLiveMatch = status === 'live' || (isV2Format && apiMatch.live === true);
  // For completed matches, we also need currentScore to calculate result
  const needsScore = isLiveMatch || status === 'completed';
  if (needsScore && scores.length > 0) {
    if (sport === 'football') {
      currentScore = {
        home: { runs: homeScore.score || 0, wickets: 0, overs: 0, balls: 0 },
        away: { runs: awayScore.score || 0, wickets: 0, overs: 0, balls: 0 },
      };
    } else {
      // v2.0 uses 'total' for runs, v3 uses 'score'
      // IMPORTANT: Check if homeScore/awayScore actually have data before using them
      // If a scoreboard exists but has no data (total: 0, overs: 0), it might be the 'extra' type
      const homeHasData = homeScore.total > 0 || homeScore.overs > 0 || homeScore.wickets > 0;
      const awayHasData = awayScore.total > 0 || awayScore.overs > 0 || awayScore.wickets > 0;
      
      let homeRuns = 0;
      let awayRuns = 0;
      
      // Only use homeScore if it has actual data and belongs to home team
      if (homeHasData && homeScore.team_id === localteamId) {
        homeRuns = isV2Format ? (homeScore.total || 0) : (homeScore.score || 0);
      } else if (homeHasData && homeScore.team_id === visitorteamId) {
        // homeScore actually belongs to away team - swap
        awayRuns = isV2Format ? (homeScore.total || 0) : (homeScore.score || 0);
      }
      
      // Only use awayScore if it has actual data and belongs to away team
      if (awayHasData && awayScore.team_id === visitorteamId) {
        awayRuns = isV2Format ? (awayScore.total || 0) : (awayScore.score || 0);
      } else if (awayHasData && awayScore.team_id === localteamId) {
        // awayScore actually belongs to home team - swap
        homeRuns = isV2Format ? (awayScore.total || 0) : (awayScore.score || 0);
      }
      
      // Fallback: If we still don't have scores, try to find them from all scoreboards
      if (homeRuns === 0 && awayRuns === 0 && isV2Format) {
        // Find scoreboard for home team
        const homeScoreboard = scores.find((s: any) => s.team_id === localteamId && s.type === 'total' && (s.total > 0 || s.overs > 0));
        if (homeScoreboard) {
          homeRuns = homeScoreboard.total || 0;
        }
        // Find scoreboard for away team
        const awayScoreboard = scores.find((s: any) => s.team_id === visitorteamId && s.type === 'total' && (s.total > 0 || s.overs > 0));
        if (awayScoreboard) {
          awayRuns = awayScoreboard.total || 0;
        }
      }
      
      // Ensure we're using the correct scores for home and away
      // Double-check that homeScore and awayScore are actually different
      if (isV2Format && homeScore.team_id === awayScore.team_id && homeScore.team_id !== undefined && scores.length > 1) {
        const localteamId = apiMatch.localteam_id;
        const visitorteamId = apiMatch.visitorteam_id;
        console.error('[Transformer] ERROR: homeScore and awayScore have same team_id when constructing currentScore!', {
          team_id: homeScore.team_id,
          localteamId,
          visitorteamId,
          homeScore: { team_id: homeScore.team_id, total: homeScore.total, overs: homeScore.overs },
          awayScore: { team_id: awayScore.team_id, total: awayScore.total, overs: awayScore.overs },
          allScores: scores.map((s: any) => ({ scoreboard: s.scoreboard, team_id: s.team_id, total: s.total, overs: s.overs }))
        });
        
        // If they're the same and we have multiple scores, try to fix it
        // Find the correct away score
        if (homeScore.team_id === localteamId) {
          const correctAwayScore = scores.find((s: any) => s.team_id === visitorteamId && s.team_id !== localteamId);
          if (correctAwayScore) {
            awayScore = correctAwayScore;
            awayRuns = isV2Format ? (awayScore.total || 0) : (awayScore.score || 0);
            console.log('[Transformer] Fixed awayScore in currentScore construction');
          } else {
            // Only one innings complete - set away to 0
            awayRuns = 0;
            awayScore = { team_id: visitorteamId, total: 0, wickets: 0, overs: 0 };
          }
        } else {
          // homeScore is wrong, find correct home score
          const correctHomeScore = scores.find((s: any) => s.team_id === localteamId && s.team_id !== visitorteamId);
          if (correctHomeScore) {
            homeScore = correctHomeScore;
            homeRuns = isV2Format ? (homeScore.total || 0) : (homeScore.score || 0);
            console.log('[Transformer] Fixed homeScore in currentScore construction');
          } else {
            // Only one innings complete - set home to 0
            homeRuns = 0;
            homeScore = { team_id: localteamId, total: 0, wickets: 0, overs: 0 };
          }
        }
      }
      
      // Extract wickets - API uses 'wickets' field (not 'w')
      // CRITICAL: Always get wickets from the 'total' type scoreboard, not 'extra' type
      // The 'extra' type scoreboard has wickets: 0, but 'total' type has the actual wickets
      let homeWickets = 0;
      let awayWickets = 0;
      
      if (isV2Format && scores.length > 0) {
        // Find the 'total' type scoreboards for each team (these have the actual wickets)
        const homeTotalScoreboard = scores.find((s: any) => 
          s.team_id === localteamId && 
          s.type === 'total' &&
          (s.total > 0 || s.overs > 0)
        );
        const awayTotalScoreboard = scores.find((s: any) => 
          s.team_id === visitorteamId && 
          s.type === 'total' &&
          (s.total > 0 || s.overs > 0)
        );
        
        // Extract wickets from the correct scoreboard
        if (homeTotalScoreboard) {
          homeWickets = homeTotalScoreboard.wickets !== undefined ? homeTotalScoreboard.wickets : 0;
        } else if (homeScore.team_id === localteamId && homeScore.type === 'total') {
          // Fallback: use homeScore if it's the correct type
          homeWickets = homeScore.wickets !== undefined ? homeScore.wickets : 0;
        }
        
        if (awayTotalScoreboard) {
          awayWickets = awayTotalScoreboard.wickets !== undefined ? awayTotalScoreboard.wickets : 0;
        } else if (awayScore.team_id === visitorteamId && awayScore.type === 'total') {
          // Fallback: use awayScore if it's the correct type
          awayWickets = awayScore.wickets !== undefined ? awayScore.wickets : 0;
        }
      } else {
        // Fallback for non-v2 format or if no scores
        homeWickets = homeScore.wickets !== undefined ? homeScore.wickets : (homeScore.w !== undefined ? homeScore.w : 0);
        awayWickets = awayScore.wickets !== undefined ? awayScore.wickets : (awayScore.w !== undefined ? awayScore.w : 0);
      }
      
      currentScore = {
        home: {
          runs: homeRuns,
          wickets: homeWickets,
          overs: parseFloat(homeScore.overs?.toString() || '0') || 0,
          balls: 0,
        },
        away: {
          runs: awayRuns,
          wickets: awayWickets,
          overs: parseFloat(awayScore.overs?.toString() || '0') || 0,
          balls: 0,
        },
      };
      
      // Debug logging for wickets
      if (process.env.NODE_ENV === 'development') {
        console.log('[Transformer] Wickets extraction:', {
          homeScore: {
            team_id: homeScore.team_id,
            wickets: homeScore.wickets,
            w: homeScore.w,
            final: homeWickets,
            total: homeScore.total
          },
          awayScore: {
            team_id: awayScore.team_id,
            wickets: awayScore.wickets,
            w: awayScore.w,
            final: awayWickets,
            total: awayScore.total
          }
        });
      }
      
      // Final validation: Log if scores are identical (which might be legitimate in some cases)
      if (currentScore.home.runs === currentScore.away.runs && 
          currentScore.home.wickets === currentScore.away.wickets &&
          currentScore.home.overs === currentScore.away.overs &&
          currentScore.home.runs > 0) {
        console.warn('[Transformer] WARNING: Both teams have identical scores!', {
          home: currentScore.home,
          away: currentScore.away,
          homeScoreTeamId: homeScore.team_id,
          awayScoreTeamId: awayScore.team_id
        });
      }
      
      // CRITICAL VERIFICATION: Always verify match status against scorecard data
      // This prevents false positives when API's state_id says completed but match is still in progress
      // IMPORTANT: Only mark as completed if BOTH teams have finished AND scores are different
      // CRITICAL: Must verify BOTH innings are complete - don't mark as completed if only one team is done
      if (currentScore && homeScore.team_id !== awayScore.team_id) {
        const matchType = (apiMatch.type || '').toLowerCase();
        const isT20 = matchType.includes('t20');
        const isODI = matchType.includes('odi');
        const maxOvers = isT20 ? 20 : isODI ? 50 : undefined;
        
        const homeAllOut = currentScore.home.wickets >= 10;
        const awayAllOut = currentScore.away.wickets >= 10;
        const homeReachedMax = maxOvers !== undefined && currentScore.home.overs >= maxOvers;
        const awayReachedMax = maxOvers !== undefined && currentScore.away.overs >= maxOvers;
        
        // SAFETY CHECK: Ensure both teams have valid score data before checking completion
        const homeHasScore = currentScore.home && (currentScore.home.overs > 0 || currentScore.home.wickets > 0);
        const awayHasScore = currentScore.away && (currentScore.away.overs > 0 || currentScore.away.wickets > 0);
        
        // Only mark as completed if BOTH teams have completed their innings
        // AND both teams have valid score data (to prevent false positives)
        const bothInningsComplete = ((homeAllOut && awayAllOut) || (homeReachedMax && awayReachedMax) || 
            (homeAllOut && awayReachedMax) || (homeReachedMax && awayAllOut)) &&
            homeHasScore && awayHasScore;
        
        if (bothInningsComplete) {
          // Both innings are complete - match is truly finished
          console.log('[Transformer] Match marked as completed: both innings finished based on scorecard', {
            homeAllOut,
            awayAllOut,
            homeReachedMax,
            awayReachedMax,
            homeOvers: currentScore.home.overs,
            homeWickets: currentScore.home.wickets,
            awayOvers: currentScore.away.overs,
            awayWickets: currentScore.away.wickets
          });
          status = 'completed';
          // Also set matchEnded flag
          apiMatch.matchEnded = true;
        } else if (status === 'completed' && !bothInningsComplete) {
          // CRITICAL FIX: API says completed but scorecard shows match is still in progress
          // Override the status to 'live' to prevent false completion
          console.warn('[Transformer] CRITICAL: API state_id says completed but scorecard shows match is still in progress!', {
            stateId: apiMatch.state_id,
            homeOvers: currentScore.home.overs,
            homeWickets: currentScore.home.wickets,
            homeAllOut,
            homeReachedMax,
            awayOvers: currentScore.away.overs,
            awayWickets: currentScore.away.wickets,
            awayAllOut,
            awayReachedMax,
            maxOvers
          });
          console.warn('[Transformer] Overriding status from "completed" to "live" based on scorecard verification');
          status = 'live';
          apiMatch.matchEnded = false;
        } else if ((homeAllOut || homeReachedMax) && !(awayAllOut || awayReachedMax)) {
          // Log warning if only one team is done (should not mark as completed)
          console.log('[Transformer] WARNING: Only one innings complete, keeping match as live', {
            homeAllOut,
            homeReachedMax,
            homeOvers: currentScore.home.overs,
            awayOvers: currentScore.away.overs,
            awayWickets: currentScore.away.wickets
          });
        }
      }
    }
  }

  // CRITICAL: Only use API-provided score data. Do not use fallbacks.
  let score: any = undefined;
  if (status === 'completed' && scores.length > 0) {
    // Use total for v2.0 format - only if API provides it
    const homeFinal = homeScore.total !== undefined && homeScore.total !== null ? homeScore.total : undefined;
    const awayFinal = awayScore.total !== undefined && awayScore.total !== null ? awayScore.total : undefined;
    
    // Only set score if both values are provided by API
    if (homeFinal !== undefined && awayFinal !== undefined) {
      score = {
        home: homeFinal,
        away: awayFinal,
      };
    }
  }

  // Extract match result ONLY for completed matches
  // CRITICAL: Do NOT calculate or show results for live matches
  // Priority: Use API's note field (official result) > Calculate from scores
  let matchResult: any = undefined;
  if (status === 'completed') {
    // First, try to parse from API's note field (most reliable)
    if (apiMatch.note && apiMatch.winner_team_id && currentScore) {
      const parsedResult = parseApiResultNote(
        apiMatch.note,
        apiMatch.winner_team_id,
        apiMatch.localteam_id,
        apiMatch.visitorteam_id,
        teams
      );
      
      if (parsedResult) {
        matchResult = parsedResult;
        if (process.env.NODE_ENV === 'development') {
          console.log('[Transformer] Using API note for result:', parsedResult.resultText);
        }
      }
    }
    
    // CRITICAL: Never calculate result locally - only use API-provided data
    // If API doesn't provide result (no note field or winner_team_id), result will be undefined
    // The services (CompletedMatchService, MatchTransitionService) will handle this by skipping the match
    // This ensures we only use results from the SportsMonks API
  }

  // Ensure matchId is always present
  if (!apiMatch.id) {
    console.error('[Transformer] ERROR: apiMatch.id is missing!', {
      apiMatch: {
        name: apiMatch.name,
        localteam_id: apiMatch.localteam_id,
        visitorteam_id: apiMatch.visitorteam_id,
        state_id: apiMatch.state_id,
        hasLocalteam: !!apiMatch.localteam,
        hasVisitorteam: !!apiMatch.visitorteam,
      }
    });
    return null; // Return null if no ID
  }

  // Build match name - handle missing name field
  let matchName = apiMatch.name;
  if (!matchName) {
    matchName = `${teams.home.name} vs ${teams.away.name}`;
  }

  return {
    _id: apiMatch.id.toString(),
    matchId: apiMatch.id.toString(),
    name: matchName,
    teams,
    venue: venueData,
    status,
    format: sport === 'cricket' ? format : undefined,
    league: sport === 'football' ? apiMatch.league?.name : undefined,
    startTime: apiMatch.starting_at ? new Date(apiMatch.starting_at) : new Date(),
    currentScore,
    score,
    matchStarted: status === 'live' || status === 'completed',
    matchEnded: status === 'completed',
    series: apiMatch.league?.name || apiMatch.season?.name || apiMatch.round || 'Unknown Series',
    detailUrl: sport === 'football' ? `/football/match/${apiMatch.id}` : `/cricket/match/${apiMatch.id}`,
    // Add innings data for scorecard (v2.0 format)
    innings: scores.length > 0
      ? scores
          .filter((s: any) => s.total !== undefined && s.overs !== undefined && s.total > 0)
          .map((s: any, index: number) => ({
            number: index + 1,
            team: s.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
            teamId: s.team_id?.toString(),
            // CRITICAL: Only use API-provided values. Do not use fallbacks.
            runs: s.total !== undefined && s.total !== null ? s.total : undefined,
            wickets: s.wickets !== undefined && s.wickets !== null ? s.wickets : undefined,
            overs: s.overs !== undefined && s.overs !== null ? parseFloat(s.overs.toString()) : undefined,
            // CRITICAL: Only use API-provided balls. Do not assume 0.
            balls: s.balls !== undefined && s.balls !== null ? s.balls : undefined,
            // CRITICAL: Only use API-provided run rate. Do not calculate locally.
            runRate: s.run_rate !== undefined && s.run_rate !== null ? s.run_rate : undefined,
          }))
      : undefined,
    // Additional match information - Extract ALL available fields from API
    matchNote: apiMatch.note !== undefined && apiMatch.note !== null ? apiMatch.note : undefined,
    round: apiMatch.round !== undefined && apiMatch.round !== null ? apiMatch.round : undefined,
    tossWon: apiMatch.toss_won_team_id 
      ? (apiMatch.toss_won_team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name)
      : undefined,
    elected: apiMatch.elected !== undefined && apiMatch.elected !== null ? apiMatch.elected : undefined,
    // CRITICAL: Only use API-provided target field. Do not parse from note or calculate locally.
    target: apiMatch.target !== undefined && apiMatch.target !== null ? apiMatch.target : undefined,
    endingAt: apiMatch.ending_at ? new Date(apiMatch.ending_at) : undefined,
    // Match result (ONLY for completed matches - undefined for live matches)
    result: status === 'completed' ? matchResult : undefined,
    // Additional API fields - Extract ALL available fields
    apiNote: apiMatch.note !== undefined && apiMatch.note !== null ? apiMatch.note : undefined,
    tossWonTeamId: apiMatch.toss_won_team_id?.toString() || undefined,
    manOfMatchId: apiMatch.man_of_match_id?.toString() || undefined,
    manOfSeriesId: apiMatch.man_of_series_id?.toString() || undefined,
    totalOversPlayed: apiMatch.total_overs_played !== undefined && apiMatch.total_overs_played !== null ? apiMatch.total_overs_played : undefined,
    superOver: apiMatch.super_over !== undefined && apiMatch.super_over !== null ? apiMatch.super_over : undefined,
    followOn: apiMatch.follow_on !== undefined && apiMatch.follow_on !== null ? apiMatch.follow_on : undefined,
    drawNoResult: apiMatch.draw_noresult !== undefined && apiMatch.draw_noresult !== null ? apiMatch.draw_noresult : undefined,
    // Additional API fields that might be available
    refereeId: apiMatch.referee_id?.toString() || undefined,
    firstUmpireId: apiMatch.firstumpire_id?.toString() || undefined,
    secondUmpireId: apiMatch.secondumpire_id?.toString() || undefined,
    tvUmpireId: apiMatch.tvumpire_id?.toString() || undefined,
    leagueId: apiMatch.league_id?.toString() || undefined,
    leagueName: apiMatch.league?.name || undefined,
    seasonId: apiMatch.season_id?.toString() || undefined,
    seasonName: apiMatch.season?.name || undefined,
    stageId: apiMatch.stage_id?.toString() || undefined,
    stageName: apiMatch.stage?.name || undefined,
    roundName: apiMatch.round_name || undefined,
    type: apiMatch.type || undefined,
    matchType: apiMatch.match_type || undefined,
    stateId: apiMatch.state_id !== undefined && apiMatch.state_id !== null ? apiMatch.state_id : undefined,
    live: apiMatch.live !== undefined && apiMatch.live !== null ? apiMatch.live : undefined,
    // Venue additional fields
    venueId: apiMatch.venue_id?.toString() || undefined,
    venueCapacity: apiMatch.venue?.capacity !== undefined && apiMatch.venue?.capacity !== null ? apiMatch.venue.capacity : undefined,
    venueImagePath: apiMatch.venue?.image_path || undefined,
    // Team additional fields
    homeTeamId: apiMatch.localteam_id?.toString() || undefined,
    awayTeamId: apiMatch.visitorteam_id?.toString() || undefined,
    homeTeamCode: apiMatch.localteam?.code || undefined,
    awayTeamCode: apiMatch.visitorteam?.code || undefined,
    homeTeamImagePath: apiMatch.localteam?.image_path || undefined,
    awayTeamImagePath: apiMatch.visitorteam?.image_path || undefined,
    // Data source tracking
    dataSource: matchResult?.dataSource || undefined, // Only set if matchResult exists (from API)
    apiFetchedAt: status === 'completed' ? new Date() : undefined,
    isCompleteData: status === 'completed' ? true : false,
    // Live data - Extract ALL available live match data from API
    liveData: status === 'live' ? (() => {
      // Extract live data from API - only use API-provided fields
      const liveData: any = {};
      
      // Check scoreboards for live data fields (they often contain the most up-to-date info)
      const currentScoreboard = scores && scores.length > 0 
        ? scores.find((s: any) => s.type === 'total' && (s.overs > 0 || s.total > 0)) || scores[0]
        : null;
      
      // Current over (if available from API - check both root and scoreboard)
      if (apiMatch.current_over !== undefined && apiMatch.current_over !== null) {
        liveData.currentOver = apiMatch.current_over;
      } else if (currentScoreboard?.current_over !== undefined && currentScoreboard?.current_over !== null) {
        liveData.currentOver = currentScoreboard.current_over;
      }
      
      // Required run rate (if available from API - check both root and scoreboard)
      if (apiMatch.required_run_rate !== undefined && apiMatch.required_run_rate !== null) {
        liveData.requiredRunRate = apiMatch.required_run_rate;
      } else if (currentScoreboard?.required_run_rate !== undefined && currentScoreboard?.required_run_rate !== null) {
        liveData.requiredRunRate = currentScoreboard.required_run_rate;
      }
      
      // Current run rate (if available from API - check both root and scoreboard)
      if (apiMatch.current_run_rate !== undefined && apiMatch.current_run_rate !== null) {
        liveData.currentRunRate = apiMatch.current_run_rate;
      } else if (currentScoreboard?.current_run_rate !== undefined && currentScoreboard?.current_run_rate !== null) {
        liveData.currentRunRate = currentScoreboard.current_run_rate;
      } else if (currentScoreboard?.run_rate !== undefined && currentScoreboard?.run_rate !== null) {
        liveData.currentRunRate = currentScoreboard.run_rate;
      }
      
      // Runs remaining (if available from API - check scoreboard)
      if (currentScoreboard?.runs_remaining !== undefined && currentScoreboard?.runs_remaining !== null) {
        liveData.runsRemaining = currentScoreboard.runs_remaining;
      } else if (apiMatch.runs_remaining !== undefined && apiMatch.runs_remaining !== null) {
        liveData.runsRemaining = apiMatch.runs_remaining;
      }
      
      // Balls remaining (if available from API - check scoreboard)
      if (currentScoreboard?.balls_remaining !== undefined && currentScoreboard?.balls_remaining !== null) {
        liveData.ballsRemaining = currentScoreboard.balls_remaining;
      } else if (apiMatch.balls_remaining !== undefined && apiMatch.balls_remaining !== null) {
        liveData.ballsRemaining = apiMatch.balls_remaining;
      }
      
      // Overs remaining (if available from API - check scoreboard)
      if (currentScoreboard?.overs_remaining !== undefined && currentScoreboard?.overs_remaining !== null) {
        liveData.oversRemaining = currentScoreboard.overs_remaining;
      } else if (apiMatch.overs_remaining !== undefined && apiMatch.overs_remaining !== null) {
        liveData.oversRemaining = apiMatch.overs_remaining;
      }
      
      // Return undefined if no live data available (don't create empty object)
      return Object.keys(liveData).length > 0 ? liveData : undefined;
    })() : undefined,
    // Current batters and bowlers for live view
    // CRITICAL: Only include for LIVE matches, not completed/finished matches
    currentBatters: (() => {
      if (!isV2Format) {
        console.log('[Transformer] Not v2 format, skipping currentBatters');
        return undefined;
      }
      
      // Check if match is finished/completed - don't show current batters for finished matches
      const matchStateId = apiMatch.state_id;
      const apiMatchStatus = apiMatch.status || '';
      const isFinished = matchStateId === 5 || matchStateId === 6 || 
                        apiMatchStatus.toLowerCase().includes('finished') || 
                        apiMatchStatus.toLowerCase() === 'completed' ||
                        apiMatch.matchEnded === true;
      if (isFinished) {
        console.log('[Transformer] Match is finished (state_id:', matchStateId, 'status:', apiMatchStatus, '), skipping currentBatters');
        return undefined;
      }
      
      console.log('[Transformer] Extracting currentBatters...');
      console.log('[Transformer] apiMatch.batting:', apiMatch.batting ? `${Array.isArray(apiMatch.batting) ? apiMatch.batting.length : 'not array'} items` : 'not present');
      console.log('[Transformer] apiMatch.scoreboards:', apiMatch.scoreboards ? `${Array.isArray(apiMatch.scoreboards) ? apiMatch.scoreboards.length : 'not array'} items` : 'not present');
      
      // Try root level first
      let battingData = apiMatch.batting;
      
      // If not at root, try extracting from scoreboards (get the latest/current scoreboard)
      if ((!battingData || !Array.isArray(battingData) || battingData.length === 0) && apiMatch.scoreboards) {
        console.log('[Transformer] Checking scoreboards for batting data...');
        // Get the most recent scoreboard (usually the one being batted on)
        const scoreboardsWithBatting = apiMatch.scoreboards.filter((sb: any) => sb.batting && Array.isArray(sb.batting) && sb.batting.length > 0);
        console.log('[Transformer] Scoreboards with batting:', scoreboardsWithBatting.length);
        
        if (scoreboardsWithBatting.length > 0) {
          const latestScoreboard = scoreboardsWithBatting
            .sort((a: any, b: any) => (b.overs || 0) - (a.overs || 0))[0];
          if (latestScoreboard && latestScoreboard.batting) {
            battingData = latestScoreboard.batting;
            console.log('[Transformer] Found batting data in scoreboard:', latestScoreboard.batting.length, 'items');
          }
        }
      }
      
      if (!battingData || !Array.isArray(battingData) || battingData.length === 0) {
        console.log('[Transformer] No batting data found');
        return undefined;
      }
      
      console.log('[Transformer] Processing', battingData.length, 'batting records');
      
      // CRITICAL: Use API's status field to determine current innings - NEVER calculate locally
      // API status field tells us which innings is in progress: "1st Innings", "2nd Innings", etc.
      const matchStatus = apiMatch.status || '';
      const isFirstInnings = matchStatus.includes('1st Innings') || matchStatus === '1st Innings';
      const isSecondInnings = matchStatus.includes('2nd Innings') || matchStatus === '2nd Innings';
      
      // CRITICAL: If status indicates "Innings Break", there are NO current batters
      // The innings is complete, so we should not show any current batters
      const isInningsBreak = matchStatus.toLowerCase().includes('innings break') || 
                             matchStatus.toLowerCase().includes('break') ||
                             matchStatus === 'Innings Break';
      
      if (isInningsBreak) {
        console.log('[Transformer] Match is in Innings Break - no current batters');
        return undefined;
      }
      
      // Determine which team is currently batting based on API status
      // For "1st Innings": usually the team that won the toss (or localteam)
      // For "2nd Innings": the other team
      let currentBattingTeamId: number | null = null;
      if (isFirstInnings) {
        // First innings: usually the team that won toss or localteam
        currentBattingTeamId = apiMatch.toss_won_team_id || apiMatch.localteam_id || null;
      } else if (isSecondInnings) {
        // Second innings: the other team (not the one that batted first)
        const firstInningsTeamId = apiMatch.toss_won_team_id || apiMatch.localteam_id;
        currentBattingTeamId = firstInningsTeamId === apiMatch.localteam_id 
          ? apiMatch.visitorteam_id 
          : apiMatch.localteam_id;
      }
      
      // Find the current innings scoreboard for the team currently batting
      // Use most recent updated_at to identify the active scoreboard for that team
      const currentInningsScoreboard = apiMatch.scoreboards && currentBattingTeamId
        ? apiMatch.scoreboards
            .filter((sb: any) => 
              sb.type === 'total' && 
              sb.overs > 0 && 
              sb.team_id === currentBattingTeamId
            )
            .sort((a: any, b: any) => {
              // Sort by most recent updated_at (newest first)
              const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
              const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
              return bTime - aTime;
            })[0]
        : null;
      
      const currentScoreboardId = currentInningsScoreboard?.scoreboard || null;
      console.log('[Transformer] API status:', matchStatus, 'Current batting team_id:', currentBattingTeamId, 'Current innings scoreboard:', currentScoreboardId, 'overs:', currentInningsScoreboard?.overs, 'updated_at:', currentInningsScoreboard?.updated_at);
      
      // Filter for current batters - ONLY from current innings AND actually active
      // CRITICAL: Only include batters who are ACTUALLY currently batting
      // The API's `active` field is the most reliable indicator - if active=false, they're NOT currently batting
      const currentBatsmen = battingData
        .filter((b: any) => {
          // Only include batters from current innings
          const isFromCurrentInnings = !currentScoreboardId || b.scoreboard === currentScoreboardId;
          
          // Get the team_id of the current innings
          const currentInningsTeamId = currentInningsScoreboard?.team_id;
          const isFromCurrentTeam = !currentInningsTeamId || b.team_id === currentInningsTeamId;
          
          // CRITICAL: Check if batter is out using ALL possible indicators
          // API may indicate dismissal through multiple fields:
          // 1. batsmanout_id - primary indicator (if set and not null/0, player is out)
          // 2. catch_stump_player_id - indicates caught or stumped
          // 3. runout_by_id - indicates run out
          // Player is OUT if ANY of these fields indicate dismissal
          const hasBatsmanoutId = b.batsmanout_id !== undefined && b.batsmanout_id !== null && b.batsmanout_id !== 0;
          const hasCatchStump = b.catch_stump_player_id !== undefined && b.catch_stump_player_id !== null && b.catch_stump_player_id !== 0;
          const hasRunout = b.runout_by_id !== undefined && b.runout_by_id !== null && b.runout_by_id !== 0;
          const isOut = hasBatsmanoutId || hasCatchStump || hasRunout;
          
          // CRITICAL: Only include batters who are:
          // 1. From current innings (scoreboard matches)
          // 2. From current team
          // 3. NOT out (checked using all dismissal indicators)
          // 4. ACTIVE (active === true) - this is the most reliable indicator of current batters
          //    If API doesn't set active=true, they're NOT currently batting
          const isActive = b.active === true;
          
          const result = isFromCurrentInnings && isFromCurrentTeam && !isOut && isActive;
          
          if (result) {
            console.log('[Transformer] Found current batter:', b.player_id, 'active:', b.active, 'scoreboard:', b.scoreboard, 'score:', b.score, 'ball:', b.ball, 'isOut:', isOut);
          } else if (isFromCurrentInnings && isFromCurrentTeam && !isOut) {
            // Log why batter was excluded (for debugging)
            console.log('[Transformer] Excluded batter (not active):', b.player_id, 'active:', b.active, 'score:', b.score, 'ball:', b.ball);
          }
          return result;
        })
        .sort((a: any, b: any) => {
          // Sort by most recent activity - check if there's a timestamp or order field
          // If not available, sort by runs (higher runs = likely more recent)
          // But prioritize active=true batters
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return 1;
          // If both active, sort by balls (more balls = likely more recent)
          return (b.ball || 0) - (a.ball || 0);
        })
        .slice(0, 2); // Get top 2 current batters
      
      console.log('[Transformer] Filtered to', currentBatsmen.length, 'current batters');
      
      if (currentBatsmen.length === 0) {
        console.log('[Transformer] No current batters after filtering');
        return undefined;
      }
      
      return currentBatsmen
        .map((b: any) => {
          // CRITICAL: Check multiple possible locations for player data from API
          // API may return player data as: player, playerinfo, player_data, batsman (for batting), bowler (for bowling)
          const playerName = extractPlayerName(
            b.player || b.batsman || b.playerinfo || b.player_data || b.bowler, 
            b.player_id
          );
          // CRITICAL: Only use API-provided values. Do not use fallbacks like || 0
          return {
            playerId: b.player_id?.toString(),
            playerName, // May be undefined - will be filtered out
            runs: b.score !== undefined && b.score !== null ? b.score : 0,
            balls: b.ball !== undefined && b.ball !== null ? b.ball : 0,
            fours: b.four_x !== undefined && b.four_x !== null ? b.four_x : 0,
            sixes: b.six_x !== undefined && b.six_x !== null ? b.six_x : 0,
            // CRITICAL: Only use API-provided strike rate. Do not calculate locally.
            strikeRate: b.rate !== undefined && b.rate !== null ? b.rate : (b.ball > 0 ? ((b.score || 0) / b.ball) * 100 : 0),
            teamId: b.team_id?.toString(),
            teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
          };
        });
      // NOTE: Filtering will be done AFTER enrichment in the service
    })(),
    currentBowlers: (() => {
      if (!isV2Format) {
        console.log('[Transformer] Not v2 format, skipping currentBowlers');
        return undefined;
      }
      
      // Check if match is finished/completed - don't show current bowlers for finished matches
      const matchStateId = apiMatch.state_id;
      const apiMatchStatus = apiMatch.status || '';
      const isFinished = matchStateId === 5 || matchStateId === 6 || 
                        apiMatchStatus.toLowerCase().includes('finished') || 
                        apiMatchStatus.toLowerCase() === 'completed' ||
                        apiMatch.matchEnded === true;
      if (isFinished) {
        console.log('[Transformer] Match is finished (state_id:', matchStateId, 'status:', apiMatchStatus, '), skipping currentBowlers');
        return undefined;
      }
      
      console.log('[Transformer] Extracting currentBowlers...');
      console.log('[Transformer] apiMatch.bowling:', apiMatch.bowling ? `${Array.isArray(apiMatch.bowling) ? apiMatch.bowling.length : 'not array'} items` : 'not present');
      console.log('[Transformer] apiMatch.scoreboards:', apiMatch.scoreboards ? `${Array.isArray(apiMatch.scoreboards) ? apiMatch.scoreboards.length : 'not array'} items` : 'not present');
      
      // Try root level first
      let bowlingData = apiMatch.bowling;
      
      // If not at root, try extracting from scoreboards (get the latest/current scoreboard)
      if ((!bowlingData || !Array.isArray(bowlingData) || bowlingData.length === 0) && apiMatch.scoreboards) {
        console.log('[Transformer] Checking scoreboards for bowling data...');
        // Get the most recent scoreboard (usually the one being bowled on)
        const scoreboardsWithBowling = apiMatch.scoreboards.filter((sb: any) => sb.bowling && Array.isArray(sb.bowling) && sb.bowling.length > 0);
        console.log('[Transformer] Scoreboards with bowling:', scoreboardsWithBowling.length);
        
        if (scoreboardsWithBowling.length > 0) {
          const latestScoreboard = scoreboardsWithBowling
            .sort((a: any, b: any) => (b.overs || 0) - (a.overs || 0))[0];
          if (latestScoreboard && latestScoreboard.bowling) {
            bowlingData = latestScoreboard.bowling;
            console.log('[Transformer] Found bowling data in scoreboard:', latestScoreboard.bowling.length, 'items');
          }
        }
      }
      
      if (!bowlingData || !Array.isArray(bowlingData) || bowlingData.length === 0) {
        console.log('[Transformer] No bowling data found');
        return undefined;
      }
      
      console.log('[Transformer] Processing', bowlingData.length, 'bowling records');
      
      // CRITICAL: Use API's status field to determine current innings - NEVER calculate locally
      // API status field tells us which innings is in progress: "1st Innings", "2nd Innings", etc.
      const matchStatus = apiMatch.status || '';
      const isFirstInnings = matchStatus.includes('1st Innings') || matchStatus === '1st Innings';
      const isSecondInnings = matchStatus.includes('2nd Innings') || matchStatus === '2nd Innings';
      
      // Determine which team is currently batting (bowling team is the opposite)
      let currentBattingTeamId: number | null = null;
      if (isFirstInnings) {
        currentBattingTeamId = apiMatch.toss_won_team_id || apiMatch.localteam_id || null;
      } else if (isSecondInnings) {
        const firstInningsTeamId = apiMatch.toss_won_team_id || apiMatch.localteam_id;
        currentBattingTeamId = firstInningsTeamId === apiMatch.localteam_id 
          ? apiMatch.visitorteam_id 
          : apiMatch.localteam_id;
      }
      
      // Find the current innings scoreboard for the team currently batting
      // Use most recent updated_at to identify the active scoreboard for that team
      const currentInningsScoreboard = apiMatch.scoreboards && currentBattingTeamId
        ? apiMatch.scoreboards
            .filter((sb: any) => 
              sb.type === 'total' && 
              sb.overs > 0 && 
              sb.team_id === currentBattingTeamId
            )
            .sort((a: any, b: any) => {
              // Sort by most recent updated_at (newest first)
              const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
              const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
              return bTime - aTime;
            })[0]
        : null;
      
      const currentScoreboardId = currentInningsScoreboard?.scoreboard || null;
      console.log('[Transformer] API status:', matchStatus, 'Current batting team_id:', currentBattingTeamId, 'Current innings scoreboard for bowling:', currentScoreboardId, 'overs:', currentInningsScoreboard?.overs, 'updated_at:', currentInningsScoreboard?.updated_at);
      
      // Filter for current bowlers - ONLY from current innings AND actually active
      // CRITICAL: Only include bowlers who are ACTUALLY currently bowling
      // The API's `active` field is the most reliable indicator - if active=false, they're NOT currently bowling
      const currentBowlers = bowlingData
        .filter((b: any) => {
          // Only include bowlers from current innings
          const isFromCurrentInnings = !currentScoreboardId || b.scoreboard === currentScoreboardId;
          
          // Get the team_id of the current innings (batting team)
          // The bowling team is the opposite team
          const currentInningsTeamId = currentInningsScoreboard?.team_id;
          const isFromBowlingTeam = !currentInningsTeamId || b.team_id !== currentInningsTeamId;
          
          // CRITICAL: Only include bowlers who are:
          // 1. From current innings (scoreboard matches)
          // 2. From bowling team (opposite of batting team)
          // 3. ACTIVE (active === true) - this is the most reliable indicator of current bowlers
          //    If API doesn't set active=true, they're NOT currently bowling
          const isActive = b.active === true;
          const hasOvers = b.overs > 0; // Must have bowled at least some overs
          
          const result = isFromCurrentInnings && isFromBowlingTeam && hasOvers && isActive;
          
          if (result) {
            console.log('[Transformer] Found current bowler:', b.player_id, 'active:', b.active, 'scoreboard:', b.scoreboard, 'overs:', b.overs, 'wickets:', b.wickets);
          } else if (isFromCurrentInnings && isFromBowlingTeam && hasOvers) {
            // Log why bowler was excluded (for debugging)
            console.log('[Transformer] Excluded bowler (not active):', b.player_id, 'active:', b.active, 'overs:', b.overs, 'wickets:', b.wickets);
          }
          return result;
        })
        .sort((a: any, b: any) => {
          // Sort by most recent activity - check overs (more overs = likely more recent)
          // But prioritize active=true bowlers
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return 1;
          return (b.overs || 0) - (a.overs || 0);
        })
        .slice(0, 2); // Get top 2 current bowlers
      
      console.log('[Transformer] Filtered to', currentBowlers.length, 'current bowlers');
      
      if (currentBowlers.length === 0) {
        console.log('[Transformer] No current bowlers after filtering');
        return undefined;
      }
      
      return currentBowlers
        .map((b: any) => {
          // CRITICAL: Check multiple possible locations for player data from API
          // API may return player data as: player, playerinfo, player_data, batsman (for batting), bowler (for bowling)
          const playerName = extractPlayerName(
            b.player || b.batsman || b.playerinfo || b.player_data || b.bowler, 
            b.player_id
          );
          // CRITICAL: Only use API-provided values. Do not use fallbacks like || 0
          return {
            playerId: b.player_id?.toString(),
            playerName, // May be undefined - will be filtered out
            overs: b.overs !== undefined && b.overs !== null ? parseFloat(b.overs.toString()) : 0,
            maidens: b.maidens !== undefined && b.maidens !== null ? b.maidens : 0,
            runs: b.runs !== undefined && b.runs !== null ? b.runs : 0,
            wickets: b.wickets !== undefined && b.wickets !== null ? b.wickets : 0,
            // CRITICAL: Only use API-provided economy rate. Do not calculate locally.
            economy: b.rate !== undefined && b.rate !== null ? b.rate : (b.overs && parseFloat(b.overs.toString()) > 0 ? (b.runs || 0) / parseFloat(b.overs.toString()) : 0),
            teamId: b.team_id?.toString(),
            teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
          };
        });
      // NOTE: Filtering will be done AFTER enrichment in the service
    })(),
    // CRITICAL: Only use API-provided partnership data. Never calculate locally.
    // Check for partnership fields directly from API
    partnership: (() => {
      if (!isV2Format) return undefined;
      
      // Check if API provides partnership data directly
      if (apiMatch.partnership) {
        // API provides partnership object directly
        const apiPartnership = apiMatch.partnership;
        return {
          runs: apiPartnership.runs !== undefined && apiPartnership.runs !== null ? apiPartnership.runs : undefined,
          balls: apiPartnership.balls !== undefined && apiPartnership.balls !== null ? apiPartnership.balls : undefined,
          runRate: apiPartnership.run_rate !== undefined && apiPartnership.run_rate !== null 
            ? apiPartnership.run_rate.toString() 
            : (apiPartnership.rate !== undefined && apiPartnership.rate !== null ? apiPartnership.rate.toString() : undefined),
        };
      }
      
      // Check for individual partnership fields
      if (apiMatch.partnership_runs !== undefined || apiMatch.partnership_balls !== undefined) {
        return {
          runs: apiMatch.partnership_runs !== undefined && apiMatch.partnership_runs !== null ? apiMatch.partnership_runs : undefined,
          balls: apiMatch.partnership_balls !== undefined && apiMatch.partnership_balls !== null ? apiMatch.partnership_balls : undefined,
          runRate: apiMatch.partnership_rate !== undefined && apiMatch.partnership_rate !== null 
            ? apiMatch.partnership_rate.toString() 
            : undefined,
        };
      }
      
      // CRITICAL: Find partnership from the CURRENT/ACTIVE innings scoreboard, not just any 'total' scoreboard
      // Use the same logic as currentBatters to identify the current innings
      if (apiMatch.scoreboards && Array.isArray(apiMatch.scoreboards)) {
        // Determine current batting team using the same logic as currentBatters
        const matchStatus = apiMatch.status || '';
        const isFirstInnings = matchStatus.includes('1st Innings') || matchStatus === '1st Innings';
        const isSecondInnings = matchStatus.includes('2nd Innings') || matchStatus === '2nd Innings';
        
        let currentBattingTeamId: number | null = null;
        if (isFirstInnings) {
          currentBattingTeamId = localteamId || null;
        } else if (isSecondInnings) {
          currentBattingTeamId = visitorteamId || null;
        } else {
          // If status doesn't indicate innings, try to find the team with most recent activity
          const activeScoreboard = apiMatch.scoreboards
            .filter((sb: any) => sb.type === 'total' && sb.overs > 0)
            .sort((a: any, b: any) => {
              const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
              const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
              return bTime - aTime;
            })[0];
          currentBattingTeamId = activeScoreboard?.team_id || null;
        }
        
        // Find the current innings scoreboard - same logic as currentBatters
        const currentInningsScoreboard = currentBattingTeamId
          ? apiMatch.scoreboards
              .filter((sb: any) => 
                sb.type === 'total' && 
                sb.overs > 0 && 
                sb.team_id === currentBattingTeamId
              )
              .sort((a: any, b: any) => {
                // Sort by most recent updated_at (newest first)
                const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return bTime - aTime;
              })[0]
          : null;
        
        // If we found the current innings scoreboard, check it for partnership data
        if (currentInningsScoreboard) {
          // Check for nested partnership object
          if (currentInningsScoreboard.partnership && typeof currentInningsScoreboard.partnership === 'object') {
            const p = currentInningsScoreboard.partnership;
            console.log(`[Transformer] Found partnership in current innings scoreboard (${currentInningsScoreboard.scoreboard}):`, p);
            return {
              runs: p.runs !== undefined && p.runs !== null ? p.runs : undefined,
              balls: p.balls !== undefined && p.balls !== null ? p.balls : undefined,
              runRate: p.run_rate !== undefined && p.run_rate !== null 
                ? p.run_rate.toString() 
                : (p.rate !== undefined && p.rate !== null ? p.rate.toString() : undefined),
            };
          }
          
          // Check for individual partnership fields in scoreboard
          if (currentInningsScoreboard.partnership_runs !== undefined || currentInningsScoreboard.partnership_balls !== undefined) {
            console.log(`[Transformer] Found partnership fields in current innings scoreboard (${currentInningsScoreboard.scoreboard}): runs=${currentInningsScoreboard.partnership_runs}, balls=${currentInningsScoreboard.partnership_balls}`);
            return {
              runs: currentInningsScoreboard.partnership_runs !== undefined && currentInningsScoreboard.partnership_runs !== null 
                ? currentInningsScoreboard.partnership_runs 
                : undefined,
              balls: currentInningsScoreboard.partnership_balls !== undefined && currentInningsScoreboard.partnership_balls !== null 
                ? currentInningsScoreboard.partnership_balls 
                : undefined,
              runRate: currentInningsScoreboard.partnership_rate !== undefined && currentInningsScoreboard.partnership_rate !== null 
                ? currentInningsScoreboard.partnership_rate.toString() 
                : undefined,
            };
          }
        }
        
        // Fallback: If current innings scoreboard doesn't have partnership, check all 'total' scoreboards
        // (but prefer the one with most recent activity)
        const fallbackScoreboard = apiMatch.scoreboards
          .filter((sb: any) => sb.type === 'total' && sb.overs > 0)
          .sort((a: any, b: any) => {
            const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return bTime - aTime;
          })[0];
        
        if (fallbackScoreboard) {
          if (fallbackScoreboard.partnership && typeof fallbackScoreboard.partnership === 'object') {
            const p = fallbackScoreboard.partnership;
            console.log(`[Transformer] Found partnership in fallback scoreboard (${fallbackScoreboard.scoreboard}):`, p);
            return {
              runs: p.runs !== undefined && p.runs !== null ? p.runs : undefined,
              balls: p.balls !== undefined && p.balls !== null ? p.balls : undefined,
              runRate: p.run_rate !== undefined && p.run_rate !== null 
                ? p.run_rate.toString() 
                : (p.rate !== undefined && p.rate !== null ? p.rate.toString() : undefined),
            };
          }
          
          if (fallbackScoreboard.partnership_runs !== undefined || fallbackScoreboard.partnership_balls !== undefined) {
            console.log(`[Transformer] Found partnership fields in fallback scoreboard (${fallbackScoreboard.scoreboard}): runs=${fallbackScoreboard.partnership_runs}, balls=${fallbackScoreboard.partnership_balls}`);
            return {
              runs: fallbackScoreboard.partnership_runs !== undefined && fallbackScoreboard.partnership_runs !== null 
                ? fallbackScoreboard.partnership_runs 
                : undefined,
              balls: fallbackScoreboard.partnership_balls !== undefined && fallbackScoreboard.partnership_balls !== null 
                ? fallbackScoreboard.partnership_balls 
                : undefined,
              runRate: fallbackScoreboard.partnership_rate !== undefined && fallbackScoreboard.partnership_rate !== null 
                ? fallbackScoreboard.partnership_rate.toString() 
                : undefined,
            };
          }
        }
        
        // Log all scoreboards for debugging
        for (const sb of apiMatch.scoreboards) {
          const sbKeys = Object.keys(sb);
          const partnershipKeys = sbKeys.filter(k => k.toLowerCase().includes('partnership') || k.toLowerCase().includes('part'));
          if (partnershipKeys.length > 0) {
            console.log(`[Transformer] Scoreboard ${sb.scoreboard || sb.type || 'unknown'} has partnership keys: ${partnershipKeys.join(', ')}`);
            partnershipKeys.forEach(key => {
              console.log(`[Transformer] ${key}: ${JSON.stringify(sb[key])}`);
            });
          }
        }
      }
      
      // CRITICAL: If API doesn't provide partnership data, return undefined
      // Do NOT calculate locally (e.g., by summing current batters' scores)
      return undefined;
    })(),
    lastWicket: isV2Format && apiMatch.batting && Array.isArray(apiMatch.batting)
      ? (() => {
          // CRITICAL: Use ALL API fields to determine if player is out - not just batsmanout_id
          const lastOut = apiMatch.batting
            .filter((b: any) => {
              const hasBatsmanoutId = b.batsmanout_id !== undefined && b.batsmanout_id !== null && b.batsmanout_id !== 0;
              const hasCatchStump = b.catch_stump_player_id !== undefined && b.catch_stump_player_id !== null && b.catch_stump_player_id !== 0;
              const hasRunout = b.runout_by_id !== undefined && b.runout_by_id !== null && b.runout_by_id !== 0;
              return (hasBatsmanoutId || hasCatchStump || hasRunout) && b.fow_score !== undefined;
            })
            .sort((a: any, b: any) => (b.fow_score || 0) - (a.fow_score || 0))[0];
          if (lastOut) {
            // CRITICAL: Check multiple possible locations for player data from API
            const playerName = extractPlayerName(
              lastOut.player || lastOut.batsman || lastOut.playerinfo || lastOut.player_data, 
              lastOut.player_id
            );
            // Only return lastWicket if player name is available (no placeholders)
            if (!playerName) {
              return undefined;
            }
            return {
              playerId: lastOut.player_id?.toString(),
              playerName,
              runs: lastOut.score || 0,
              balls: lastOut.ball || 0,
              fowScore: lastOut.fow_score,
              fowBalls: lastOut.fow_balls,
            };
          }
          return undefined;
        })()
      : undefined,
    // Add batting and bowling statistics
    // Check both root level and nested in scoreboards
    batting: (() => {
      if (!isV2Format) return undefined;
      
      // Try root level first
      let battingData = apiMatch.batting;
      
      // Debug logging
      console.log('[Transformer] Checking batting data:', {
        hasRootBatting: !!apiMatch.batting,
        rootBattingType: Array.isArray(apiMatch.batting) ? 'array' : typeof apiMatch.batting,
        rootBattingLength: Array.isArray(apiMatch.batting) ? apiMatch.batting.length : 'N/A',
        hasScoreboards: !!apiMatch.scoreboards,
        scoreboardsLength: apiMatch.scoreboards?.length || 0,
      });
      
      // If not at root, try extracting from scoreboards
      if ((!battingData || !Array.isArray(battingData) || battingData.length === 0) && apiMatch.scoreboards) {
        const allBatting: any[] = [];
        apiMatch.scoreboards.forEach((scoreboard: any, index: number) => {
          console.log(`[Transformer] Scoreboard ${index} keys:`, Object.keys(scoreboard || {}));
          if (scoreboard.batting && Array.isArray(scoreboard.batting)) {
            console.log(`[Transformer] Found ${scoreboard.batting.length} batting records in scoreboard ${index}`);
            allBatting.push(...scoreboard.batting);
          }
        });
        if (allBatting.length > 0) {
          battingData = allBatting;
          console.log(`[Transformer] Extracted ${allBatting.length} batting records from scoreboards`);
        }
      }
      
      if (!battingData || !Array.isArray(battingData) || battingData.length === 0) {
        console.log('[Transformer] No batting data found');
        return undefined;
      }
      
      console.log(`[Transformer] Processing ${battingData.length} batting records`);
      
      return battingData
        .filter((b: any) => b.score !== undefined && b.score !== null && (b.score > 0 || b.ball > 0))
        .map((b: any) => {
          // Player name - try to get from included player data
          // Check multiple possible locations for player data (including batsman field from API)
          const playerData = b.player || b.batsman || b.playerinfo || b.player_data || b.player_data?.data;
          
          // Log for debugging
          if (b.player_id) {
            if (b.batsman) {
              console.log(`[Transformer] Batting player ${b.player_id} has batsman field with fullname: ${b.batsman.fullname || 'N/A'}`);
            } else if (!playerData) {
              console.warn(`[Transformer] No player data for batting player_id=${b.player_id}, keys:`, Object.keys(b));
            }
          }
          
          // CRITICAL: Check multiple possible locations for player data from API
          // API may return player data as: player, batsman, playerinfo, player_data
          const playerName = extractPlayerName(playerData, b.player_id);
          
          if (b.player_id && !playerName && playerData) {
            console.warn(`[Transformer] Failed to extract name from playerData for batting player_id=${b.player_id}, playerData keys:`, Object.keys(playerData || {}));
          }
          
          // CRITICAL: isOut should be determined from ALL API fields that indicate dismissal
          // API may indicate dismissal through multiple fields - check ALL of them:
          // 1. batsmanout_id - primary indicator
          // 2. catch_stump_player_id - indicates caught or stumped
          // 3. runout_by_id - indicates run out
          // 4. wicket_id - indicates a wicket was taken (if present and batsmanout_id is null, might still be out)
          // Player is OUT if ANY of these fields indicate dismissal
          const hasBatsmanoutId = b.batsmanout_id !== undefined && b.batsmanout_id !== null && b.batsmanout_id !== 0;
          const hasCatchStump = b.catch_stump_player_id !== undefined && b.catch_stump_player_id !== null && b.catch_stump_player_id !== 0;
          const hasRunout = b.runout_by_id !== undefined && b.runout_by_id !== null && b.runout_by_id !== 0;
          const hasWicketId = b.wicket_id !== undefined && b.wicket_id !== null && b.wicket_id !== 0;
          
          // If player has a wicket_id but no batsmanout_id, they might still be out (check if they're in a completed innings)
          // For completed innings, if a player has wicket_id and is not in current innings, they're likely out
          const isOut = hasBatsmanoutId || hasCatchStump || hasRunout || (hasWicketId && !b.active);
          
          return {
            playerId: b.player_id?.toString(),
            playerName, // May be undefined if API doesn't provide it
            // CRITICAL: Only use API-provided values. Do not use fallbacks like || 0
            runs: b.score !== undefined && b.score !== null ? b.score : undefined,
            balls: b.ball !== undefined && b.ball !== null ? b.ball : undefined,
            fours: b.four_x !== undefined && b.four_x !== null ? b.four_x : undefined,
            sixes: b.six_x !== undefined && b.six_x !== null ? b.six_x : undefined,
            // CRITICAL: Only use API-provided strike rate. Do not calculate locally.
            strikeRate: b.rate !== undefined && b.rate !== null ? b.rate : undefined,
            isOut,
            dismissedBy: b.bowling_player_id?.toString(),
            teamId: b.team_id?.toString(),
            teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
            fowScore: b.fow_score !== undefined && b.fow_score !== null ? b.fow_score : undefined,
            fowBalls: b.fow_balls !== undefined && b.fow_balls !== null ? b.fow_balls : undefined,
          };
        })
        .sort((a: any, b: any) => b.runs - a.runs); // Sort by runs descending
      // NOTE: Filtering will be done AFTER enrichment in the service
    })(),
    bowling: (() => {
      if (!isV2Format) return undefined;
      
      // Try root level first
      let bowlingData = apiMatch.bowling;
      
      // Debug logging
      console.log('[Transformer] Checking bowling data:', {
        hasRootBowling: !!apiMatch.bowling,
        rootBowlingType: Array.isArray(apiMatch.bowling) ? 'array' : typeof apiMatch.bowling,
        rootBowlingLength: Array.isArray(apiMatch.bowling) ? apiMatch.bowling.length : 'N/A',
        hasScoreboards: !!apiMatch.scoreboards,
        scoreboardsLength: apiMatch.scoreboards?.length || 0,
      });
      
      // If not at root, try extracting from scoreboards
      if ((!bowlingData || !Array.isArray(bowlingData) || bowlingData.length === 0) && apiMatch.scoreboards) {
        const allBowling: any[] = [];
        apiMatch.scoreboards.forEach((scoreboard: any, index: number) => {
          if (scoreboard.bowling && Array.isArray(scoreboard.bowling)) {
            console.log(`[Transformer] Found ${scoreboard.bowling.length} bowling records in scoreboard ${index}`);
            allBowling.push(...scoreboard.bowling);
          }
        });
        if (allBowling.length > 0) {
          bowlingData = allBowling;
          console.log(`[Transformer] Extracted ${allBowling.length} bowling records from scoreboards`);
        }
      }
      
      if (!bowlingData || !Array.isArray(bowlingData) || bowlingData.length === 0) {
        console.log('[Transformer] No bowling data found');
        return undefined;
      }
      
      console.log(`[Transformer] Processing ${bowlingData.length} bowling records`);
      
      return bowlingData
        .filter((b: any) => (b.overs || b.wickets) && (b.overs > 0 || b.wickets > 0))
        .map((b: any) => {
          // Player name - try to get from included player data
          // Check multiple possible locations for player data (including bowler field from API)
          const playerData = b.player || b.bowler || b.playerinfo || b.player_data || b.player_data?.data;
          
          // Log for debugging
          if (b.player_id) {
            if (b.bowler) {
              console.log(`[Transformer] Bowling player ${b.player_id} has bowler field with fullname: ${b.bowler.fullname || 'N/A'}`);
            } else if (!playerData) {
              console.warn(`[Transformer] No player data for bowling player_id=${b.player_id}, keys:`, Object.keys(b));
            }
          }
          
          // CRITICAL: Check multiple possible locations for player data from API
          // API may return player data as: player, bowler, playerinfo, player_data
          const playerName = extractPlayerName(playerData, b.player_id);
          
          if (b.player_id && !playerName && playerData) {
            console.warn(`[Transformer] Failed to extract name from playerData for bowling player_id=${b.player_id}, playerData keys:`, Object.keys(playerData || {}));
          }
          
          return {
            playerId: b.player_id?.toString(),
            playerName, // May be undefined if API doesn't provide it - will be filtered out
            // CRITICAL: Only use API-provided values. Do not use fallbacks like || 0
            overs: b.overs !== undefined && b.overs !== null ? parseFloat(b.overs.toString()) : undefined,
            maidens: b.maidens !== undefined && b.maidens !== null ? b.maidens : undefined,
            runs: b.runs !== undefined && b.runs !== null ? b.runs : undefined,
            wickets: b.wickets !== undefined && b.wickets !== null ? b.wickets : undefined,
            // CRITICAL: Only use API-provided economy rate. Do not calculate locally.
            economy: b.rate !== undefined && b.rate !== null ? b.rate : undefined,
            teamId: b.team_id?.toString(),
            teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
          };
        })
        .sort((a: any, b: any) => b.wickets - a.wickets || a.economy - b.economy); // Sort by wickets, then economy
      // NOTE: Filtering will be done AFTER enrichment in the service
    })(),
  };
}





