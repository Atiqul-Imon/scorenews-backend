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
  
  if (isV2Format) {
    // v2.0 format: use live field and status
    if (apiMatch.live === true) {
      status = 'live';
    } else if (apiMatch.status && (apiMatch.status.includes('Finished') || apiMatch.status.includes('Completed'))) {
      status = 'completed';
    } else if (apiMatch.status && apiMatch.status.includes('Innings')) {
      status = 'live';
    } else {
      status = 'upcoming';
    }
  } else {
    // v3 format: use state_id
    const stateId = apiMatch.state_id;
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
          .filter((s: any) => s.total !== undefined && s.overs !== undefined)
          .map((s: any, index: number) => ({
            number: index + 1,
            team: s.team_id === apiMatch.localteam_id ? teams.home.name : teams.away.name,
            runs: s.total || 0,
            wickets: s.wickets || 0,
            overs: parseFloat(s.overs?.toString() || '0') || 0,
            balls: 0,
            runRate: parseFloat(s.overs?.toString() || '0') > 0 
              ? ((s.total || 0) / parseFloat(s.overs?.toString() || '1')) 
              : 0,
          }))
      : undefined,
  };
}





