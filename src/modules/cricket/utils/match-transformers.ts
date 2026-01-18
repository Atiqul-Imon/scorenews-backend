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
  const participants = apiMatch.participants || [];
  const homeParticipant = participants.find((p: any) => p.meta?.location === 'home') || participants[0] || {};
  const awayParticipant = participants.find((p: any) => p.meta?.location === 'away') || participants[1] || {};

  const scores = apiMatch.scores || [];
  const homeScore = scores.find((s: any) => s.scoreboard === '1' || s.participant_id === homeParticipant.id) || scores[0] || {};
  const awayScore = scores.find((s: any) => s.scoreboard === '2' || s.participant_id === awayParticipant.id) || scores[1] || {};

  let status: 'live' | 'completed' | 'upcoming' | 'cancelled' = 'upcoming';
  const stateId = apiMatch.state_id;
  if (stateId === 5 || stateId === 6) {
    status = 'completed';
  } else if (stateId === 3 || stateId === 4) {
    status = 'live';
  } else if (stateId === 1) {
    status = 'upcoming';
  }

  const venue = apiMatch.venue || {};
  const venueData = {
    name: venue.name || 'Unknown Venue',
    city: venue.city || 'Unknown',
    country: venue.country || 'Unknown',
  };

  let format: string = 't20';
  if (sport === 'cricket') {
    const typeId = apiMatch.type_id;
    if (typeId === 1) format = 'test';
    else if (typeId === 2) format = 'odi';
    else if (typeId === 3) format = 't20';
  }

  const teams = {
    home: {
      id: homeParticipant.id?.toString() || '',
      name: homeParticipant.name || 'Team 1',
      flag: '🏏',
      shortName: homeParticipant.short_code || homeParticipant.name?.substring(0, 3).toUpperCase() || 'T1',
    },
    away: {
      id: awayParticipant.id?.toString() || '',
      name: awayParticipant.name || 'Team 2',
      flag: '🏏',
      shortName: awayParticipant.short_code || awayParticipant.name?.substring(0, 3).toUpperCase() || 'T2',
    },
  };

  let currentScore: any = undefined;
  if (status === 'live' && scores.length > 0) {
    if (sport === 'football') {
      currentScore = {
        home: { runs: homeScore.score || 0, wickets: 0, overs: 0, balls: 0 },
        away: { runs: awayScore.score || 0, wickets: 0, overs: 0, balls: 0 },
      };
    } else {
      currentScore = {
        home: {
          runs: homeScore.score || 0,
          wickets: homeScore.wickets || 0,
          overs: parseFloat(homeScore.overs?.toString() || '0') || 0,
          balls: 0,
        },
        away: {
          runs: awayScore.score || 0,
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
    series: apiMatch.league?.name || apiMatch.season?.name || 'Unknown Series',
    detailUrl: sport === 'football' ? `/football/match/${apiMatch.id}` : `/cricket/match/${apiMatch.id}`,
  };
}




