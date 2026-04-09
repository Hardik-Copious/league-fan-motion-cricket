import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  const url = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');

  var ready = false;
  if (url.isNotEmpty && anonKey.isNotEmpty) {
    await Supabase.initialize(url: url, anonKey: anonKey);
    ready = true;
  }

  runApp(LeagueFanApp(supabaseReady: ready));
}

class LeagueFanApp extends StatelessWidget {
  const LeagueFanApp({super.key, required this.supabaseReady});

  final bool supabaseReady;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Demo League Fan',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0EA5E9), brightness: Brightness.dark),
        useMaterial3: true,
      ),
      home: supabaseReady
          ? const AppShell()
          : const Scaffold(
              body: SafeArea(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Missing Supabase config.\n\n'
                    'Run with:\n'
                    'flutter run '
                    '--dart-define=SUPABASE_URL=https://YOUR_REF.supabase.co '
                    '--dart-define=SUPABASE_ANON_KEY=your_anon_key',
                  ),
                ),
              ),
            ),
    );
  }
}
