import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';
import 'match_detail_screen.dart';

const _kDefaultSeason = '2026';

class MatchesScreen extends StatefulWidget {
  const MatchesScreen({super.key});

  @override
  State<MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends State<MatchesScreen> {
  List<Season> _seasons = [];
  String _season = _kDefaultSeason;
  List<MatchRow> _matches = [];
  Map<String, Team> _teams = {};
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final client = Supabase.instance.client;
    try {
      final sRes = await client.from('seasons').select().order('year', ascending: false);
      final seasons = (sRes as List).map((e) => Season.fromMap(Map<String, dynamic>.from(e as Map))).toList();
      setState(() => _seasons = seasons);
      await _loadMatches();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMatches() async {
    setState(() => _loading = true);
    final client = Supabase.instance.client;
    try {
      final mRes = await client.from('matches').select().eq('season_id', _season).order('scheduled_at');
      final tRes = await client.from('teams').select();
      final teams = <String, Team>{};
      for (final row in tRes as List) {
        final t = Team.fromMap(Map<String, dynamic>.from(row as Map));
        teams[t.id] = t;
      }
      final matches = (mRes as List).map((e) => MatchRow.fromMap(Map<String, dynamic>.from(e as Map))).toList();
      setState(() {
        _matches = matches;
        _teams = teams;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat.yMMMd().add_jm();

    return Scaffold(
      appBar: AppBar(title: const Text('Matches')),
      body: _error != null
          ? Center(child: Text(_error!))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_seasons.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('match-season-$_season'),
                      decoration: const InputDecoration(labelText: 'Season', border: OutlineInputBorder()),
                      initialValue: _seasons.any((s) => s.id == _season) ? _season : _kDefaultSeason,
                      items: _seasons
                          .map((s) => DropdownMenuItem(value: s.id, child: Text('${s.label} (${s.year})')))
                          .toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _season = v);
                        _loadMatches();
                      },
                    ),
                  ),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _matches.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final m = _matches[i];
                            final h = _teams[m.homeTeamId]?.shortCode ?? m.homeTeamId;
                            final a = _teams[m.awayTeamId]?.shortCode ?? m.awayTeamId;
                            return ListTile(
                              tileColor: const Color(0xFF151A22),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              title: Text('$h vs $a'),
                              subtitle: Text('${fmt.format(m.scheduledAt.toLocal())}\n${m.venue}'),
                              isThreeLine: true,
                              trailing: _StatusChip(status: m.status),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(builder: (_) => MatchDetailScreen(matchId: m.id)),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    Color bg = const Color(0xFF243044);
    Color fg = Colors.white70;
    if (status == 'live') {
      bg = const Color(0xFF422006);
      fg = const Color(0xFFFDBA74);
    } else if (status == 'completed') {
      bg = const Color(0xFF052E16);
      fg = const Color(0xFF86EFAC);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(status, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
    );
  }
}
