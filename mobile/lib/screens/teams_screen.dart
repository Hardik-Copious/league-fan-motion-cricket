import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';
import 'team_detail_screen.dart';

class TeamsScreen extends StatefulWidget {
  const TeamsScreen({super.key});

  @override
  State<TeamsScreen> createState() => _TeamsScreenState();
}

class _TeamsScreenState extends State<TeamsScreen> {
  late final Future<List<Team>> _future = _load();

  Future<List<Team>> _load() async {
    final res = await Supabase.instance.client.from('teams').select().order('name');
    return (res as List).map((e) => Team.fromMap(Map<String, dynamic>.from(e as Map))).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Teams')),
      body: FutureBuilder<List<Team>>(
        future: _future,
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text('${snap.error}'));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final teams = snap.data!;
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: teams.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final t = teams[i];
              return ListTile(
                tileColor: const Color(0xFF151A22),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                leading: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: _hex(t.primaryColor),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                title: Text(t.name),
                subtitle: Text('${t.shortCode} · ${t.city ?? t.homeVenue ?? ''}'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => TeamDetailScreen(team: t)),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Color _hex(String h) {
    var s = h.replaceFirst('#', '');
    if (s.length == 6) s = 'FF$s';
    return Color(int.parse(s, radix: 16));
  }
}
