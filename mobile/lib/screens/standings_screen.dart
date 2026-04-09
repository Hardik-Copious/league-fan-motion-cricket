import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';
import 'team_detail_screen.dart';

const _kDefaultSeason = '2026';

class StandingsScreen extends StatefulWidget {
  const StandingsScreen({super.key});

  @override
  State<StandingsScreen> createState() => _StandingsScreenState();
}

class _StandingsScreenState extends State<StandingsScreen> {
  List<Season> _seasons = [];
  String _season = _kDefaultSeason;
  List<Standing> _standings = [];
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
      await _loadTable();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadTable() async {
    setState(() => _loading = true);
    final client = Supabase.instance.client;
    try {
      final sRes = await client
          .from('standings')
          .select()
          .eq('season_id', _season)
          .order('points', ascending: false)
          .order('nrr', ascending: false);
      final tRes = await client.from('teams').select();
      final teams = <String, Team>{};
      for (final row in tRes as List) {
        final t = Team.fromMap(Map<String, dynamic>.from(row as Map));
        teams[t.id] = t;
      }
      final standings = (sRes as List).map((e) => Standing.fromMap(Map<String, dynamic>.from(e as Map))).toList();
      setState(() {
        _standings = standings;
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
    return Scaffold(
      appBar: AppBar(title: const Text('Points table')),
      body: _error != null
          ? Center(child: Text(_error!))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_seasons.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('table-season-$_season'),
                      decoration: const InputDecoration(labelText: 'Season', border: OutlineInputBorder()),
                      initialValue: _seasons.any((s) => s.id == _season) ? _season : _kDefaultSeason,
                      items: _seasons
                          .map((s) => DropdownMenuItem(value: s.id, child: Text('${s.label} (${s.year})')))
                          .toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _season = v);
                        _loadTable();
                      },
                    ),
                  ),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : ListView(
                          children: [
                            DataTable(
                              columns: const [
                                DataColumn(label: Text('Team')),
                                DataColumn(label: Text('P')),
                                DataColumn(label: Text('W')),
                                DataColumn(label: Text('L')),
                                DataColumn(label: Text('Pts')),
                                DataColumn(label: Text('NRR')),
                              ],
                              rows: _standings.map((r) {
                                final name = _teams[r.teamId]?.name ?? r.teamId;
                                return DataRow(
                                  key: ValueKey('${r.seasonId}-${r.teamId}'),
                                  onSelectChanged: (_) {
                                    final t = _teams[r.teamId];
                                    if (t != null) {
                                      Navigator.of(context).push(
                                        MaterialPageRoute<void>(builder: (_) => TeamDetailScreen(team: t)),
                                      );
                                    }
                                  },
                                  cells: [
                                    DataCell(Text(name)),
                                    DataCell(Text('${r.played}')),
                                    DataCell(Text('${r.won}')),
                                    DataCell(Text('${r.lost}')),
                                    DataCell(Text('${r.points}')),
                                    DataCell(Text(r.nrr.toStringAsFixed(3))),
                                  ],
                                );
                              }).toList(),
                            ),
                          ],
                        ),
                ),
              ],
            ),
    );
  }
}
