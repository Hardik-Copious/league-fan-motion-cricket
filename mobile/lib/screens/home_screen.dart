import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';
import 'auth_screen.dart';
import 'games_screen.dart';
import 'matches_screen.dart';
import 'standings_screen.dart';
import 'stats_screen.dart';
import 'teams_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
              child: SizedBox(
                height: 200,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(
                      'assets/images/cricket-hero.png',
                      fit: BoxFit.cover,
                      alignment: Alignment.center,
                    ),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.35),
                            const Color(0xFF0c1118).withValues(alpha: 0.92),
                          ],
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 48, 20, 20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                      Text(
                        'Demo Premier League',
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              color: Colors.amber.shade200,
                              letterSpacing: 1.2,
                              fontWeight: FontWeight.w800,
                            ),
                      ),
                      Text(
                        'Season hub',
                        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                      ),
                      Text(
                        'Archive · stats · live centre (fictional)',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.white70),
                      ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(20),
            sliver: SliverList.list(
              children: [
                FutureBuilder<List<_ChampCard>>(
                  future: _pastChampionCards(),
                  builder: (context, snap) {
                    if (!snap.hasData || snap.data!.isEmpty) return const SizedBox.shrink();
                    final past = snap.data!;
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Hall of champions', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 108,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: past.length,
                            separatorBuilder: (_, __) => const SizedBox(width: 10),
                            itemBuilder: (_, i) {
                              final c = past[i];
                              return Container(
                                width: 148,
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF151A22),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.amber.withValues(alpha: 0.35)),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${c.year}', style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.amber)),
                                    const Text('🏆', style: TextStyle(fontSize: 18)),
                                    Expanded(
                                      child: Text(
                                        c.championName,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                    );
                  },
                ),
                FilledButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const MatchesScreen())),
                  child: const Text('Matches'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const StandingsScreen())),
                  child: const Text('Points table'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const StatsScreen())),
                  child: const Text('Stats hub'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TeamsScreen())),
                  child: const Text('Teams'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const GamesScreen())),
                  child: const Text('Games'),
                ),
                const SizedBox(height: 24),
                if (session == null)
                  TextButton(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AuthScreen())),
                    child: const Text('Sign in for predictions & scores'),
                  )
                else
                  Text('Signed in as ${session.user.email}', style: const TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Future<List<_ChampCard>> _pastChampionCards() async {
    final client = Supabase.instance.client;
    final sRes = await client.from('seasons').select().order('year', ascending: false);
    final tRes = await client.from('teams').select();
    final teams = <String, Team>{};
    for (final row in tRes as List) {
      final t = Team.fromMap(Map<String, dynamic>.from(row as Map));
      teams[t.id] = t;
    }
    final seasons = (sRes as List).map((e) => Season.fromMap(Map<String, dynamic>.from(e as Map))).toList();
    final out = <_ChampCard>[];
    for (final s in seasons) {
      final cid = s.championTeamId;
      if (cid == null) continue;
      out.add(_ChampCard(year: s.year, championName: teams[cid]?.name ?? cid));
    }
    return out;
  }
}

class _ChampCard {
  _ChampCard({required this.year, required this.championName});

  final int year;
  final String championName;
}
