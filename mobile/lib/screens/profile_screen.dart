import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models.dart';
import 'auth_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _dn = TextEditingController();
  List<Team> _teams = [];
  String? _favoriteId;
  String? _error;
  bool _saved = false;
  bool _loading = true;

  @override
  void dispose() {
    _dn.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) {
      setState(() => _loading = false);
      return;
    }
    final tRes = await client.from('teams').select().order('name');
    final p = await client.from('profiles').select().eq('id', user.id).maybeSingle();
    if (!mounted) return;
    setState(() {
      _teams = (tRes as List).map((e) => Team.fromMap(Map<String, dynamic>.from(e as Map))).toList();
      if (p != null) {
        _dn.text = (p['display_name'] as String?) ?? '';
        _favoriteId = p['favorite_team_id'] as String?;
      }
      _loading = false;
    });
  }

  Future<void> _save() async {
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (user == null) return;
    setState(() {
      _error = null;
      _saved = false;
    });
    try {
      await client.from('profiles').update({
        'display_name': _dn.text.trim().isEmpty ? null : _dn.text.trim(),
        'favorite_team_id': _favoriteId,
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }).eq('id', user.id);
      if (!mounted) return;
      setState(() => _saved = true);
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
    final user = Supabase.instance.client.auth.currentUser;
    if (_loading) {
      return Scaffold(appBar: AppBar(title: const Text('Profile')), body: const Center(child: CircularProgressIndicator()));
    }
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: Center(
          child: FilledButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AuthScreen())),
            child: const Text('Sign in'),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          TextButton(
            onPressed: () async {
              await Supabase.instance.client.auth.signOut();
              if (context.mounted) Navigator.of(context).pop();
            },
            child: const Text('Sign out'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(user.email ?? '', style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 16),
          TextField(
            decoration: const InputDecoration(labelText: 'Display name'),
            controller: _dn,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            key: ValueKey(_favoriteId),
            decoration: const InputDecoration(labelText: 'Favorite team'),
            initialValue: _favoriteId,
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('None')),
              ..._teams.map((t) => DropdownMenuItem<String?>(value: t.id, child: Text(t.name))),
            ],
            onChanged: (v) => setState(() => _favoriteId = v),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _save, child: const Text('Save')),
          if (_saved) const Padding(padding: EdgeInsets.only(top: 12), child: Text('Saved.')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
        ],
      ),
    );
  }
}
