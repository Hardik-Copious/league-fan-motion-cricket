import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';

class MatchDetailScreen extends StatefulWidget {
  const MatchDetailScreen({super.key, required this.matchId});

  final String matchId;

  @override
  State<MatchDetailScreen> createState() => _MatchDetailScreenState();
}

class _MatchDetailScreenState extends State<MatchDetailScreen> {
  MatchRow? _match;
  Map<String, Team> _teams = {};
  String? _picked;
  String? _error;
  String? _msg;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final client = Supabase.instance.client;
    final m = await client.from('matches').select().eq('id', widget.matchId).maybeSingle();
    final t = await client.from('teams').select();
    if (!mounted) return;
    setState(() {
      if (m != null) _match = MatchRow.fromMap(Map<String, dynamic>.from(m));
      _teams = {};
      for (final row in t as List) {
        final team = Team.fromMap(Map<String, dynamic>.from(row as Map));
        _teams[team.id] = team;
      }
    });
    final user = client.auth.currentUser;
    if (user != null) {
      final p = await client.from('predictions').select('picked_team_id').eq('match_id', widget.matchId).eq('user_id', user.id).maybeSingle();
      if (!mounted) return;
      if (p != null && p['picked_team_id'] != null) {
        setState(() => _picked = p['picked_team_id'] as String);
      }
    }
  }

  Future<void> _savePick(String teamId) async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null || _match == null) return;
    setState(() {
      _error = null;
      _msg = null;
    });
    try {
      await client.from('predictions').upsert({
        'user_id': user.id,
        'match_id': widget.matchId,
        'picked_team_id': teamId,
      }, onConflict: 'user_id,match_id');
      if (!mounted) return;
      setState(() {
        _picked = teamId;
        _msg = 'Prediction saved.';
      });
    } on PostgrestException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = _match;
    final fmt = DateFormat.yMMMd().add_jm();
    if (m == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    }
    final home = _teams[m.homeTeamId];
    final away = _teams[m.awayTeamId];
    final session = Supabase.instance.client.auth.currentSession;

    return Scaffold(
      appBar: AppBar(title: Text('${home?.shortCode ?? m.homeTeamId} vs ${away?.shortCode ?? m.awayTeamId}')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(fmt.format(m.scheduledAt.toLocal()), style: const TextStyle(color: Colors.white70)),
          Text(m.venue, style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 8),
          Text('Status: ${m.status}'),
          if (m.resultSummary != null) ...[
            const SizedBox(height: 8),
            Text(m.resultSummary!),
          ],
          if (m.status == 'scheduled') ...[
            const SizedBox(height: 24),
            Text('Pick a winner', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (session == null)
              const Text('Sign in from More → Sign in to save a prediction.')
            else ...[
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _savePick(m.homeTeamId),
                      child: Text(home?.name ?? 'Home'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => _savePick(m.awayTeamId),
                      child: Text(away?.name ?? 'Away'),
                    ),
                  ),
                ],
              ),
              if (_picked != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text('Your pick: ${_teams[_picked]?.shortCode ?? _picked}', style: const TextStyle(color: Colors.white70)),
                ),
              if (_msg != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_msg!)),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
            ],
          ],
        ],
      ),
    );
  }
}
