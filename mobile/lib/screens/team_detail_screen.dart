import 'package:flutter/material.dart';

import '../models.dart';

class TeamDetailScreen extends StatelessWidget {
  const TeamDetailScreen({super.key, required this.team});

  final Team team;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(team.shortCode)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(team.name, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '${team.city ?? ''}${team.city != null ? ' · ' : ''}Est. ${team.foundedYear ?? '—'}',
              style: const TextStyle(color: Colors.white70),
            ),
            Text(team.homeVenue ?? '', style: const TextStyle(color: Colors.white70)),
            if (team.blurb != null) ...[
              const SizedBox(height: 16),
              Text(team.blurb!),
            ],
          ],
        ),
      ),
    );
  }
}
