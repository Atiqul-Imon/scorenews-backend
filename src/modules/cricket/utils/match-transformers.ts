/**
 * Extract player name from various possible API response structures
 * Checks multiple locations where player data might be stored
 */
function extractPlayerName(playerData: any, playerId?: any): string {
  if (!playerData && !playerId) {
    return 'Unknown Player';
  }

  // If playerData is a string, use it directly
  if (typeof playerData === 'string' && playerData.trim()) {
    return playerData;
  }

  // If playerData is an object, check various possible fields
  if (typeof playerData === 'object' && playerData !== null) {
    // Check for nested data structure (API might return { data: { ... } })
    const actualData = playerData.data || playerData;
    
    // Try common field names for player names
    const name = actualData.fullname || 
                 actualData.full_name || 
                 actualData.name || 
                 actualData.firstname || 
                 actualData.first_name ||
                 (actualData.firstname && actualData.lastname ? `${actualData.firstname} ${actualData.lastname}` : null) ||
                 (actualData.first_name && actualData.last_name ? `${actualData.first_name} ${actualData.last_name}` : null);
    
    if (name && typeof name === 'string' && name.trim()) {
      return name.trim();
    }
  }

  // Fallback to player ID if no name found
  return `Player ${playerId || 'Unknown'}`;
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
 * Calculate match result for completed matches
 * Determines winner, margin, and margin type (runs or wickets) based on batting order
 * This is used as a fallback when API doesn't provide result in note field
 */
export function calculateMatchResult(
  currentScore: any,
  scores: any[],
  teams: any,
  localteamId: any,
  visitorteamId: any,
  isV2Format: boolean,
  winnerTeamId?: any // Optional: winner_team_id from API
): any {
  try {
    const homeRuns = currentScore.home?.runs || 0;
    const awayRuns = currentScore.away?.runs || 0;
    const homeWickets = currentScore.home?.wickets ?? 10;
    const awayWickets = currentScore.away?.wickets ?? 10;

    // Determine which team batted first based on scoreboard order
    // S1 = first innings, S2 = second innings
    let firstInningsTeam: 'home' | 'away' | null = null;
    let secondInningsTeam: 'home' | 'away' | null = null;

    if (isV2Format && scores.length >= 2) {
      // Find S1 (first innings) and S2 (second innings)
      const firstInnings = scores.find((s: any) => s.scoreboard === 'S1');
      const secondInnings = scores.find((s: any) => s.scoreboard === 'S2');

      if (firstInnings && secondInnings) {
        if (firstInnings.team_id === localteamId) {
          firstInningsTeam = 'home';
          secondInningsTeam = 'away';
        } else if (firstInnings.team_id === visitorteamId) {
          firstInningsTeam = 'away';
          secondInningsTeam = 'home';
        }
      }
    }

    // Determine winner - use API's winner_team_id if available, otherwise calculate from scores
    let homeWon: boolean;
    if (winnerTeamId !== undefined && winnerTeamId !== null) {
      // Use API's winner_team_id as primary source of truth
      homeWon = winnerTeamId === localteamId;
    } else {
      // Fallback: calculate from scores
      homeWon = homeRuns > awayRuns;
    }
    
    const winner = homeWon ? 'home' : 'away';
    const winnerName = homeWon ? teams.home.name : teams.away.name;
    const winnerScore = homeWon ? currentScore.home : currentScore.away;
    const winnerWickets = winnerScore?.wickets ?? 10;

    // Calculate margin
    const runMargin = Math.abs(homeRuns - awayRuns);
    let marginType: 'runs' | 'wickets' = 'runs';
    let resultText = '';
    let finalMargin = runMargin; // Default to run margin

    // Determine margin type based on batting order
    if (firstInningsTeam && secondInningsTeam) {
      // We know batting order
      if (winner === firstInningsTeam) {
        // Team batting first won - always by runs
        marginType = 'runs';
        finalMargin = runMargin;
        resultText = `${winnerName} won by ${runMargin} runs`;
      } else {
        // Team batting second won
        if (winnerWickets < 10) {
          // Winner has wickets remaining - won by wickets
          const wicketsRemaining = 10 - winnerWickets;
          marginType = 'wickets';
          finalMargin = wicketsRemaining; // Use wickets remaining, not run margin
          resultText = `${winnerName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
        } else {
          // Winner lost all wickets but still won (rare) - won by runs
          marginType = 'runs';
          finalMargin = runMargin;
          resultText = `${winnerName} won by ${runMargin} runs`;
        }
      }
    } else {
      // Fallback: Infer batting order from wickets
      // If winner has wickets remaining, they likely batted second
      if (winnerWickets < 10) {
        // Winner has wickets remaining - likely batted second and won by wickets
        const wicketsRemaining = 10 - winnerWickets;
        marginType = 'wickets';
        finalMargin = wicketsRemaining; // Use wickets remaining, not run margin
        resultText = `${winnerName} won by ${wicketsRemaining} wicket${wicketsRemaining !== 1 ? 's' : ''}`;
      } else {
        // Winner lost all wickets - likely batted first and won by runs
        marginType = 'runs';
        finalMargin = runMargin;
        resultText = `${winnerName} won by ${runMargin} runs`;
      }
    }

    return {
      winner,
      winnerName,
      margin: finalMargin, // Use correct margin (runs or wickets)
      marginType,
      resultText,
    };
  } catch (error) {
    console.error('[Transformer] Error calculating match result:', error);
    return undefined;
  }
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

  const venueParts = (apiMatch.venue || '').split(',').map((p: string) => p.trim());
  const venue = {
    name: venueParts[0] || 'Unknown Venue',
    city: venueParts[1] || venueParts[0] || 'Unknown',
    country: venueParts[2] || venueParts[1] || 'Unknown',
  };

  return {
    _id: apiMatch.id || apiMatch.matchId,
    matchId: apiMatch.id || apiMatch.matchId,
    name: apiMatch.name || `${homeTeam.name || teams[0]} vs ${awayTeam.name || teams[1]}`,
    teams: {
      home: {
        id: homeTeam.name || teams[0] || '',
        name: homeTeam.name || teams[0] || 'Team 1',
        flag: '🏏',
        shortName: homeTeam.shortname || homeTeam.shortName || (teams[0]?.substring(0, 3).toUpperCase() || 'T1'),
      },
      away: {
        id: awayTeam.name || teams[1] || '',
        name: awayTeam.name || teams[1] || 'Team 2',
        flag: '🏏',
        shortName: awayTeam.shortname || awayTeam.shortName || (teams[1]?.substring(0, 3).toUpperCase() || 'T2'),
      },
    },
    venue,
    status,
    format,
    startTime: apiMatch.dateTimeGMT ? new Date(apiMatch.dateTimeGMT) : apiMatch.date ? new Date(apiMatch.date) : new Date(),
    currentScore: scores.length > 0
      ? {
          home: {
            runs: homeScore.r || 0,
            wickets: homeScore.w || 0,
            overs: parseFloat(homeScore.o?.toString() || '0') || 0,
            balls: Math.floor((parseFloat(homeScore.o?.toString() || '0') % 1) * 10) || 0,
          },
          away: {
            runs: awayScore.r || 0,
            wickets: awayScore.w || 0,
            overs: parseFloat(awayScore.o?.toString() || '0') || 0,
            balls: Math.floor((parseFloat(awayScore.o?.toString() || '0') % 1) * 10) || 0,
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
  const isV2Format = sport === 'cricket' && (apiMatch.localteam || apiMatch.visitorteam);
  
  let homeParticipant: any = {};
  let awayParticipant: any = {};
  let scores: any[] = [];
  
  if (isV2Format) {
    // v2.0 format: localteam, visitorteam, scoreboards
    homeParticipant = apiMatch.localteam || {};
    awayParticipant = apiMatch.visitorteam || {};
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
  // state_id is often undefined in v2.0, so we prioritize live field and status field
  const stateId = apiMatch.state_id;
  
  // v2.0 format: Prioritize live field and status field over state_id
  // CRITICAL: If match comes from livescores endpoint, it's LIVE by default
  // Matches from livescores endpoint often have state_id: undefined but are actually live
  
  // Priority 1: Check live field (most reliable for v2.0)
  if (apiMatch.live === true) {
    status = 'live';
  } 
  // Priority 2: Check state_id if available (for v2.0, this might be undefined)
  else if (stateId !== undefined) {
    if (stateId === 5 || stateId === 6) {
      status = 'completed';
    } else if (stateId === 3 || stateId === 4) {
      status = 'live';
    } else if (stateId === 1 || stateId === 2) {
      status = 'upcoming';
    }
  }
  // Priority 3: Check status field for completed
  else if (apiMatch.status && (apiMatch.status.includes('Finished') || apiMatch.status.includes('Completed') || apiMatch.status.includes('Result'))) {
    status = 'completed';
  } 
  // Priority 4: Check status field for live indicators (e.g., "2nd Innings", "1st Innings")
  else if (apiMatch.status && (apiMatch.status.includes('Innings') || apiMatch.status.includes('Live') || apiMatch.status.includes('In Progress'))) {
    status = 'live';
  } 
  // Priority 5: If we have score data, it's likely live
  else {
    const hasScoreData = scores.length > 0 && (homeScore.total > 0 || awayScore.total > 0 || homeScore.overs > 0 || awayScore.overs > 0);
    if (hasScoreData) {
      status = 'live';
    } 
    // Priority 6: If match has started (by time), consider it live
    else if (apiMatch.starting_at) {
      const startTime = new Date(apiMatch.starting_at);
      const now = new Date();
      if (startTime <= now) {
        // Match has started - if it's not explicitly completed, it's likely live
        status = 'live';
      } else {
        status = 'upcoming';
      }
    } 
    else {
      status = 'upcoming';
    }
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
    homeTeamName = typeof apiMatch.localteam === 'string' 
      ? apiMatch.localteam 
      : (apiMatch.localteam?.name || 'Team 1');
    awayTeamName = typeof apiMatch.visitorteam === 'string' 
      ? apiMatch.visitorteam 
      : (apiMatch.visitorteam?.name || 'Team 2');
    homeTeamShortName = typeof apiMatch.localteam === 'object' && apiMatch.localteam?.code
      ? apiMatch.localteam.code
      : homeTeamName.substring(0, 3).toUpperCase();
    awayTeamShortName = typeof apiMatch.visitorteam === 'object' && apiMatch.visitorteam?.code
      ? apiMatch.visitorteam.code
      : awayTeamName.substring(0, 3).toUpperCase();
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

  let score: any = undefined;
  if (status === 'completed' && scores.length > 0) {
    // Use total for v2.0 format
    const homeFinal = homeScore.total || 0;
    const awayFinal = awayScore.total || 0;
    score = {
      home: homeFinal,
      away: awayFinal,
    };
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
    
    // Fallback: Calculate from scores if API note is not available or parsing failed
    if (!matchResult && currentScore && scores.length >= 2) {
        matchResult = calculateMatchResult(
        currentScore,
        scores,
        teams,
        apiMatch.localteam_id,
        apiMatch.visitorteam_id,
        true, // Always v2.0 format
        apiMatch.winner_team_id // Use API's winner_team_id if available
      );
      if (matchResult) {
        matchResult.dataSource = 'calculated';
        if (process.env.NODE_ENV === 'development') {
          console.log('[Transformer] Calculated result (API note not available):', matchResult.resultText);
        }
      }
    }
  }

  return {
    _id: apiMatch.id?.toString(),
    matchId: apiMatch.id?.toString(),
    name: apiMatch.name || `${teams.home.name} vs ${teams.away.name}`,
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
            runs: s.total || 0,
            wickets: s.wickets || 0,
            overs: parseFloat(s.overs?.toString() || '0') || 0,
            balls: 0,
            runRate: parseFloat(s.overs?.toString() || '0') > 0 
              ? ((s.total || 0) / parseFloat(s.overs?.toString() || '1')) 
              : 0,
          }))
      : undefined,
    // Additional match information
    matchNote: apiMatch.note || undefined,
    round: apiMatch.round || undefined,
    tossWon: apiMatch.toss_won_team_id 
      ? (apiMatch.toss_won_team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name)
      : undefined,
    elected: apiMatch.elected || undefined,
    target: apiMatch.note?.includes('Target') 
      ? parseInt(apiMatch.note.match(/Target (\d+)/)?.[1] || '0')
      : undefined,
    endingAt: apiMatch.ending_at ? new Date(apiMatch.ending_at) : undefined,
    // Match result (ONLY for completed matches - undefined for live matches)
    result: status === 'completed' ? matchResult : undefined,
    // Additional API fields for completed matches
    apiNote: apiMatch.note || undefined, // Raw API note field
    tossWonTeamId: apiMatch.toss_won_team_id?.toString() || undefined,
    manOfMatchId: apiMatch.man_of_match_id?.toString() || undefined,
    manOfSeriesId: apiMatch.man_of_series_id?.toString() || undefined,
    totalOversPlayed: apiMatch.total_overs_played || undefined,
    superOver: apiMatch.super_over || false,
    followOn: apiMatch.follow_on || false,
    drawNoResult: apiMatch.draw_noresult || false,
    // Data source tracking
    dataSource: matchResult?.dataSource || (status === 'completed' ? 'calculated' : undefined),
    apiFetchedAt: status === 'completed' ? new Date() : undefined,
    isCompleteData: status === 'completed' ? true : false,
    // Current batters and bowlers for live view
    currentBatters: (() => {
      if (!isV2Format) {
        console.log('[Transformer] Not v2 format, skipping currentBatters');
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
      
      // Filter for current batters (not out, and have some activity)
      // Relaxed filter: include any batter that's not out, even if they haven't scored yet
      const currentBatsmen = battingData
        .filter((b: any) => {
          const isNotOut = !b.batsmanout_id;
          const hasActivity = b.active === true || b.score > 0 || b.ball > 0;
          const result = isNotOut && (hasActivity || b.active === true);
          if (result) {
            console.log('[Transformer] Found current batter:', b.player_id, 'active:', b.active, 'score:', b.score, 'ball:', b.ball);
          }
          return result;
        })
        .sort((a: any, b: any) => {
          // Sort by active first, then by runs
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return 1;
          return (b.score || 0) - (a.score || 0);
        })
        .slice(0, 2); // Get top 2 current batters
      
      console.log('[Transformer] Filtered to', currentBatsmen.length, 'current batters');
      
      if (currentBatsmen.length === 0) {
        console.log('[Transformer] No current batters after filtering');
        return undefined;
      }
      
      return currentBatsmen.map((b: any) => {
        const playerName = extractPlayerName(b.player || b.playerinfo || b.player_data, b.player_id);
        return {
          playerId: b.player_id?.toString(),
          playerName,
          runs: b.score || 0,
          balls: b.ball || 0,
          fours: b.four_x || 0,
          sixes: b.six_x || 0,
          strikeRate: b.rate || (b.ball > 0 ? ((b.score || 0) / b.ball) * 100 : 0),
          teamId: b.team_id?.toString(),
          teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
        };
      });
    })(),
    currentBowlers: (() => {
      if (!isV2Format) {
        console.log('[Transformer] Not v2 format, skipping currentBowlers');
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
      
      // Filter for current bowlers (have bowled at least some overs or are active)
      // Relaxed filter: include any bowler that's active or has bowled
      const currentBowlers = bowlingData
        .filter((b: any) => {
          const hasOvers = b.overs > 0;
          const isActive = b.active === true;
          const hasWickets = b.wickets >= 0;
          const result = (hasOvers || isActive) && hasWickets;
          if (result) {
            console.log('[Transformer] Found current bowler:', b.player_id, 'active:', b.active, 'overs:', b.overs, 'wickets:', b.wickets);
          }
          return result;
        })
        .sort((a: any, b: any) => {
          // Sort by active first, then by most recent (highest overs)
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
      
      return currentBowlers.map((b: any) => {
        const playerName = extractPlayerName(b.player || b.playerinfo || b.player_data, b.player_id);
        return {
          playerId: b.player_id?.toString(),
          playerName,
          overs: parseFloat(b.overs?.toString() || '0') || 0,
          maidens: b.maidens || 0,
          runs: b.runs || 0,
          wickets: b.wickets || 0,
          economy: b.rate || (parseFloat(b.overs?.toString() || '0') > 0 ? (b.runs || 0) / parseFloat(b.overs?.toString() || '1') : 0),
          teamId: b.team_id?.toString(),
          teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
        };
      });
    })(),
    partnership: isV2Format && apiMatch.batting && Array.isArray(apiMatch.batting)
      ? (() => {
          const currentBatsmen = apiMatch.batting.filter((b: any) => b.active === true || (!b.batsmanout_id && (b.score > 0 || b.ball > 0)));
          if (currentBatsmen.length >= 2) {
            const totalRuns = currentBatsmen.reduce((sum: number, b: any) => sum + (b.score || 0), 0);
            const totalBalls = currentBatsmen.reduce((sum: number, b: any) => sum + (b.ball || 0), 0);
            const partnershipRR = totalBalls > 0 ? ((totalRuns / totalBalls) * 6).toFixed(2) : '0.00';
            return {
              runs: totalRuns,
              balls: totalBalls,
              runRate: partnershipRR,
            };
          }
          return undefined;
        })()
      : undefined,
    lastWicket: isV2Format && apiMatch.batting && Array.isArray(apiMatch.batting)
      ? (() => {
          const lastOut = apiMatch.batting
            .filter((b: any) => b.batsmanout_id && b.fow_score !== undefined)
            .sort((a: any, b: any) => (b.fow_score || 0) - (a.fow_score || 0))[0];
          if (lastOut) {
            const playerName = extractPlayerName(lastOut.player || lastOut.playerinfo || lastOut.player_data, lastOut.player_id);
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
          // Player name - try to get from included player data, otherwise use player_id
          const playerName = extractPlayerName(b.player || b.playerinfo || b.player_data, b.player_id);
          
          return {
            playerId: b.player_id?.toString(),
            playerName,
            runs: b.score || 0,
            balls: b.ball || 0,
            fours: b.four_x || 0,
            sixes: b.six_x || 0,
            strikeRate: b.rate || (b.ball > 0 ? ((b.score || 0) / b.ball) * 100 : 0),
            isOut: !!b.batsmanout_id,
            dismissedBy: b.bowling_player_id?.toString(),
            teamId: b.team_id?.toString(),
            teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
            fowScore: b.fow_score || undefined,
            fowBalls: b.fow_balls || undefined,
          };
        })
        .sort((a: any, b: any) => b.runs - a.runs); // Sort by runs descending
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
          // Player name - try to get from included player data, otherwise use player_id
          const playerName = extractPlayerName(b.player || b.playerinfo || b.player_data, b.player_id);
          
          return {
            playerId: b.player_id?.toString(),
            playerName,
            overs: parseFloat(b.overs?.toString() || '0') || 0,
            maidens: b.maidens || 0,
            runs: b.runs || 0,
            wickets: b.wickets || 0,
            economy: b.rate || (parseFloat(b.overs?.toString() || '0') > 0 ? (b.runs || 0) / parseFloat(b.overs?.toString() || '1') : 0),
            teamId: b.team_id?.toString(),
            teamName: b.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
          };
        })
        .sort((a: any, b: any) => b.wickets - a.wickets || a.economy - b.economy); // Sort by wickets, then economy
    })(),
  };
}





