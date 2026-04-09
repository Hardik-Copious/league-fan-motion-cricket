import 'package:flutter/material.dart';

import 'screens/auth_screen.dart';
import 'screens/games_screen.dart';
import 'screens/home_screen.dart';
import 'screens/matches_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/standings_screen.dart';
import 'screens/stats_screen.dart';
import 'screens/teams_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      const HomeScreen(),
      const MatchesScreen(),
      const StandingsScreen(),
      const TeamsScreen(),
      const _MoreMenu(),
    ];

    return Scaffold(
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.event_outlined),
            selectedIcon: Icon(Icons.event),
            label: 'Matches',
          ),
          NavigationDestination(
            icon: Icon(Icons.table_chart_outlined),
            selectedIcon: Icon(Icons.table_chart),
            label: 'Table',
          ),
          NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: 'Teams'),
          NavigationDestination(icon: Icon(Icons.menu), selectedIcon: Icon(Icons.menu_open), label: 'More'),
        ],
      ),
    );
  }
}

class _MoreMenu extends StatelessWidget {
  const _MoreMenu();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('More', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        ListTile(
          leading: const Icon(Icons.bar_chart_outlined),
          title: const Text('Stats'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const StatsScreen())),
        ),
        ListTile(
          leading: const Icon(Icons.person_outline),
          title: const Text('Profile'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ProfileScreen())),
        ),
        ListTile(
          leading: const Icon(Icons.sports_esports_outlined),
          title: const Text('Games & leaderboard'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const GamesScreen())),
        ),
        ListTile(
          leading: const Icon(Icons.login),
          title: const Text('Sign in / Sign up'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AuthScreen())),
        ),
      ],
    );
  }
}
