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
  
  if (isV2Format) {
    // v2.0: Find latest scores by team_id matching localteam_id/visitorteam_id
    // Scoreboards can have multiple entries per team (innings), get the latest one
    const localteamId = apiMatch.localteam_id;
    const visitorteamId = apiMatch.visitorteam_id;
    
    // Get all scores for each team and take the latest (highest overs or total)
    const homeScores = scores.filter((s: any) => s.team_id === localteamId);
    const awayScores = scores.filter((s: any) => s.team_id === visitorteamId);
    
    // Get the latest score (highest overs or most recent)
    homeScore = homeScores.length > 0 
      ? homeScores.reduce((latest: any, current: any) => {
          return (current.overs || 0) > (latest.overs || 0) ? current : latest;
        }, homeScores[0])
      : scores.find((s: any) => s.scoreboard === 'S1') || scores[0] || {};
    
    awayScore = awayScores.length > 0
      ? awayScores.reduce((latest: any, current: any) => {
          return (current.overs || 0) > (latest.overs || 0) ? current : latest;
        }, awayScores[0])
      : scores.find((s: any) => s.scoreboard === 'S2') || scores[1] || {};
  } else {
    // v3: Find scores by participant_id or scoreboard
    homeScore = scores.find((s: any) => s.scoreboard === '1' || s.participant_id === homeParticipant.id) || scores[0] || {};
    awayScore = scores.find((s: any) => s.scoreboard === '2' || s.participant_id === awayParticipant.id) || scores[1] || {};
  }

  let status: 'live' | 'completed' | 'upcoming' | 'cancelled' = 'upcoming';
  
  // Check state_id first (available in both v2.0 and v3)
  const stateId = apiMatch.state_id;
  if (stateId !== undefined) {
    if (stateId === 5 || stateId === 6) {
      status = 'completed';
    } else if (stateId === 3 || stateId === 4) {
      status = 'live';
    } else if (stateId === 1 || stateId === 2) {
      status = 'upcoming';
    }
  } else if (isV2Format) {
    // v2.0 format: use live field and status as fallback
    if (apiMatch.live === true) {
      status = 'live';
    } else if (apiMatch.status && (apiMatch.status.includes('Finished') || apiMatch.status.includes('Completed') || apiMatch.status.includes('Result'))) {
      status = 'completed';
    } else if (apiMatch.status && apiMatch.status.includes('Innings')) {
      status = 'live';
    } else {
      status = 'upcoming';
    }
  } else {
    // v3 format fallback (shouldn't reach here if state_id exists)
    if (stateId === 5 || stateId === 6) {
      status = 'completed';
    } else if (stateId === 3 || stateId === 4) {
      status = 'live';
    } else if (stateId === 1) {
      status = 'upcoming';
    }
  }

  // v2.0: venue can be string or object, v3: venue is object
  let venueData: any = {
    name: 'Unknown Venue',
    city: 'Unknown',
    country: 'Unknown',
  };
  
  if (isV2Format) {
    // v2.0: venue can be a string or object
    if (typeof apiMatch.venue === 'string') {
      venueData.name = apiMatch.venue;
      venueData.city = apiMatch.venue;
    } else if (apiMatch.venue) {
      venueData = {
        name: apiMatch.venue.name || 'Unknown Venue',
        city: apiMatch.venue.city || 'Unknown',
        country: apiMatch.venue.country || 'Unknown',
      };
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
  if (isLiveMatch && scores.length > 0) {
    if (sport === 'football') {
      currentScore = {
        home: { runs: homeScore.score || 0, wickets: 0, overs: 0, balls: 0 },
        away: { runs: awayScore.score || 0, wickets: 0, overs: 0, balls: 0 },
      };
    } else {
      // v2.0 uses 'total' for runs, v3 uses 'score'
      const homeRuns = isV2Format ? (homeScore.total || 0) : (homeScore.score || 0);
      const awayRuns = isV2Format ? (awayScore.total || 0) : (awayScore.score || 0);
      
      currentScore = {
        home: {
          runs: homeRuns,
          wickets: homeScore.wickets || 0,
          overs: parseFloat(homeScore.overs?.toString() || '0') || 0,
          balls: 0,
        },
        away: {
          runs: awayRuns,
          wickets: awayScore.wickets || 0,
          overs: parseFloat(awayScore.overs?.toString() || '0') || 0,
          balls: 0,
        },
      };
    }
  }

  let score: any = undefined;
  if (status === 'completed' && scores.length > 0) {
    score = {
      home: homeScore.score || 0,
      away: awayScore.score || 0,
    };
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
    series: isV2Format 
      ? (apiMatch.league?.name || apiMatch.season?.name || apiMatch.round || 'Unknown Series')
      : (apiMatch.league?.name || apiMatch.season?.name || 'Unknown Series'),
    detailUrl: sport === 'football' ? `/football/match/${apiMatch.id}` : `/cricket/match/${apiMatch.id}`,
    // Add innings data for scorecard if available (v2.0 format)
    innings: isV2Format && scores.length > 0
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
        let playerName = `Player ${b.player_id || 'Unknown'}`;
        if (b.player) {
          if (typeof b.player === 'object') {
            playerName = b.player.fullname || b.player.name || b.player.firstname || playerName;
          } else if (typeof b.player === 'string') {
            playerName = b.player;
          }
        }
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
        let playerName = `Player ${b.player_id || 'Unknown'}`;
        if (b.player) {
          if (typeof b.player === 'object') {
            playerName = b.player.fullname || b.player.name || b.player.firstname || playerName;
          } else if (typeof b.player === 'string') {
            playerName = b.player;
          }
        }
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
            let playerName = `Player ${lastOut.player_id || 'Unknown'}`;
            if (lastOut.player) {
              if (typeof lastOut.player === 'object') {
                playerName = lastOut.player.fullname || lastOut.player.name || lastOut.player.firstname || playerName;
              } else if (typeof lastOut.player === 'string') {
                playerName = lastOut.player;
              }
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
          // Player name - try to get from included player data, otherwise use player_id
          let playerName = `Player ${b.player_id || 'Unknown'}`;
          if (b.player) {
            if (typeof b.player === 'object') {
              playerName = b.player.fullname || b.player.name || b.player.firstname || playerName;
            } else if (typeof b.player === 'string') {
              playerName = b.player;
            }
          }
          
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
          let playerName = `Player ${b.player_id || 'Unknown'}`;
          if (b.player) {
            if (typeof b.player === 'object') {
              playerName = b.player.fullname || b.player.name || b.player.firstname || playerName;
            } else if (typeof b.player === 'string') {
              playerName = b.player;
            }
          }
          
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





