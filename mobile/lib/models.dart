class Team {
  Team({
    required this.id,
    required this.name,
    required this.shortCode,
    required this.homeVenue,
    required this.city,
    required this.foundedYear,
    required this.primaryColor,
    required this.blurb,
  });

  final String id;
  final String name;
  final String shortCode;
  final String? homeVenue;
  final String? city;
  final int? foundedYear;
  final String primaryColor;
  final String? blurb;

  factory Team.fromMap(Map<String, dynamic> m) {
    return Team(
      id: m['id'] as String,
      name: m['name'] as String,
      shortCode: m['short_code'] as String,
      homeVenue: m['home_venue'] as String?,
      city: m['city'] as String?,
      foundedYear: m['founded_year'] as int?,
      primaryColor: m['primary_color'] as String? ?? '#334155',
      blurb: m['blurb'] as String?,
    );
  }
}

class Leader {
  Leader({
    required this.id,
    required this.category,
    required this.rank,
    required this.playerName,
    required this.teamId,
    required this.mainValue,
    required this.subValue,
    required this.seasonId,
  });

  final int id;
  final String category;
  final int rank;
  final String playerName;
  final String teamId;
  final String mainValue;
  final String? subValue;
  final String seasonId;

  factory Leader.fromMap(Map<String, dynamic> m) {
    return Leader(
      id: (m['id'] as num).toInt(),
      category: m['category'] as String,
      rank: m['rank'] as int,
      playerName: m['player_name'] as String,
      teamId: m['team_id'] as String,
      mainValue: m['main_value'] as String,
      subValue: m['sub_value'] as String?,
      seasonId: m['season_id'] as String? ?? '2026',
    );
  }
}

class MatchRow {
  MatchRow({
    required this.id,
    required this.scheduledAt,
    required this.venue,
    required this.homeTeamId,
    required this.awayTeamId,
    required this.status,
    required this.resultSummary,
    required this.seasonId,
  });

  final String id;
  final DateTime scheduledAt;
  final String venue;
  final String homeTeamId;
  final String awayTeamId;
  final String status;
  final String? resultSummary;
  final String seasonId;

  factory MatchRow.fromMap(Map<String, dynamic> m) {
    return MatchRow(
      id: m['id'] as String,
      scheduledAt: DateTime.parse(m['scheduled_at'] as String),
      venue: m['venue'] as String,
      homeTeamId: m['home_team_id'] as String,
      awayTeamId: m['away_team_id'] as String,
      status: m['status'] as String,
      resultSummary: m['result_summary'] as String?,
      seasonId: m['season_id'] as String? ?? '2026',
    );
  }
}

class Season {
  Season({
    required this.id,
    required this.label,
    required this.year,
    required this.tagline,
    required this.championTeamId,
    required this.runnerUpTeamId,
  });

  final String id;
  final String label;
  final int year;
  final String? tagline;
  final String? championTeamId;
  final String? runnerUpTeamId;

  factory Season.fromMap(Map<String, dynamic> m) {
    return Season(
      id: m['id'] as String,
      label: m['label'] as String,
      year: m['year'] as int,
      tagline: m['tagline'] as String?,
      championTeamId: m['champion_team_id'] as String?,
      runnerUpTeamId: m['runner_up_team_id'] as String?,
    );
  }
}

class Standing {
  Standing({
    required this.seasonId,
    required this.teamId,
    required this.played,
    required this.won,
    required this.lost,
    required this.points,
    required this.nrr,
  });

  final String seasonId;
  final String teamId;
  final int played;
  final int won;
  final int lost;
  final int points;
  final double nrr;

  factory Standing.fromMap(Map<String, dynamic> m) {
    return Standing(
      seasonId: m['season_id'] as String? ?? '2026',
      teamId: m['team_id'] as String,
      played: m['played'] as int,
      won: m['won'] as int,
      lost: m['lost'] as int,
      points: m['points'] as int,
      nrr: (m['nrr'] as num).toDouble(),
    );
  }
}
