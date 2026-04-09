import 'dart:math';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _gameType = 'tap_rally_demo';

class GamesScreen extends StatefulWidget {
  const GamesScreen({super.key});

  @override
  State<GamesScreen> createState() => _GamesScreenState();
}

class _GamesScreenState extends State<GamesScreen> {
  List<_LbRow> _rows = [];
  String? _error;
  String? _msg;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final client = Supabase.instance.client;
    try {
      final sRes = await client
          .from('game_sessions')
          .select('id, score, game_type, created_at, user_id')
          .eq('game_type', _gameType)
          .order('score', ascending: false)
          .limit(20);
      final sessions = (sRes as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      final ids = sessions.map((s) => s['user_id'] as String?).whereType<String>().toSet().toList();
      final names = <String, String?>{};
      if (ids.isNotEmpty) {
        final pRes = await client.from('profile_display').select('id, display_name').inFilter('id', ids);
        for (final row in pRes as List) {
          final m = Map<String, dynamic>.from(row as Map);
          names[m['id'] as String] = m['display_name'] as String?;
        }
      }
      if (!mounted) return;
      setState(() {
        _rows = sessions
            .map(
              (r) => _LbRow(
                id: r['id'] as String,
                score: r['score'] as int,
                createdAt: DateTime.parse(r['created_at'] as String),
                displayName: r['user_id'] != null ? names[r['user_id'] as String] : null,
              ),
            )
            .toList();
        _loading = false;
      });
    } on PostgrestException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _submitDemo() async {
    final user = Supabase.instance.client.auth.currentUser;
    setState(() {
      _msg = null;
      _error = null;
    });
    if (user == null) {
      setState(() => _error = 'Sign in to submit a score.');
      return;
    }
    final score = Random().nextInt(50) + 10;
    try {
      await Supabase.instance.client.from('game_sessions').insert({
        'user_id': user.id,
        'game_type': _gameType,
        'score': score,
        'duration_ms': 30000,
        'metadata': {'source': 'flutter_demo'},
      });
      if (!mounted) return;
      setState(() => _msg = 'Submitted demo score: $score');
      await _load();
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
    final fmt = DateFormat.yMMMd().add_jm();
    return Scaffold(
      appBar: AppBar(title: const Text('Games')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Camera and motion games run on the device; only scores are stored. This screen uses a demo score button until you add ML Kit / MediaPipe.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _submitDemo, child: const Text('Submit random demo score')),
          if (_msg != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_msg!)),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
          const SizedBox(height: 24),
          Text('Leaderboard', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          if (_loading) const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
          if (!_loading && _rows.isEmpty) const Text('No scores yet.', style: TextStyle(color: Colors.white70)),
          ..._rows.asMap().entries.map(
                (e) => Card(
                  color: const Color(0xFF151A22),
                  child: ListTile(
                    title: Text('#${e.key + 1} — ${e.value.score}'),
                    subtitle: Text('${e.value.displayName ?? 'Player'} · ${fmt.format(e.value.createdAt.toLocal())}'),
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class _LbRow {
  _LbRow({required this.id, required this.score, required this.createdAt, required this.displayName});

  final String id;
  final int score;
  final DateTime createdAt;
  final String? displayName;
}
