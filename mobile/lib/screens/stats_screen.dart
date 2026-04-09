import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';

const _kDefaultSeason = '2026';

class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  List<Season> _seasons = [];
  String _season = _kDefaultSeason;
  List<Leader> _leaders = [];
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
      await _loadLeaders();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadLeaders() async {
    setState(() => _loading = true);
    final client = Supabase.instance.client;
    try {
      final lRes = await client.from('leaders').select().eq('season_id', _season).order('category').order('rank');
      final tRes = await client.from('teams').select();
      final teams = <String, Team>{};
      for (final row in tRes as List) {
        final t = Team.fromMap(Map<String, dynamic>.from(row as Map));
        teams[t.id] = t;
      }
      final leaders = (lRes as List).map((e) => Leader.fromMap(Map<String, dynamic>.from(e as Map))).toList();
      setState(() {
        _leaders = leaders;
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
    final bat = _leaders.where((l) => l.category == 'batting').toList();
    final bowl = _leaders.where((l) => l.category == 'bowling').toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Stats')),
      body: _error != null
          ? Center(child: Text(_error!))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_seasons.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('stats-season-$_season'),
                      decoration: const InputDecoration(labelText: 'Season', border: OutlineInputBorder()),
                      initialValue: _seasons.any((s) => s.id == _season) ? _season : _kDefaultSeason,
                      items: _seasons
                          .map((s) => DropdownMenuItem(value: s.id, child: Text('${s.label} (${s.year})')))
                          .toList(),
                      onChanged: (v) {
                        if (v == null) return;
                        setState(() => _season = v);
                        _loadLeaders();
                      },
                    ),
                  ),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            Text('Orange / purple cap (demo)', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 16),
                            Text('Runs', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Colors.amber)),
                            ...bat.map((l) => _row(l)),
                            const SizedBox(height: 20),
                            Text('Wickets',
                                style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Colors.purpleAccent)),
                            ...bowl.map((l) => _row(l)),
                          ],
                        ),
                ),
              ],
            ),
    );
  }

  Widget _row(Leader l) {
    final code = _teams[l.teamId]?.shortCode ?? l.teamId;
    return Card(
      color: const Color(0xFF151A22),
      child: ListTile(
        leading: CircleAvatar(child: Text('${l.rank}')),
        title: Text(l.playerName),
        subtitle: Text('$code · ${l.subValue ?? ''}'),
        trailing: Text(l.mainValue, style: const TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }
}
