import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  var _signup = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _info = null;
    });
    final client = Supabase.instance.client;
    try {
      if (_signup) {
        await client.auth.signUp(email: _email.text.trim(), password: _password.text);
        if (!mounted) return;
        setState(() => _info = 'Check your email to confirm, or sign in if confirmations are disabled.');
      } else {
        await client.auth.signInWithPassword(email: _email.text.trim(), password: _password.text);
        if (!mounted) return;
        Navigator.of(context).pop();
      }
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_signup ? 'Create account' : 'Sign in')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Enable Email in Supabase → Authentication → Providers. Add redirect URLs for your app if required.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _email,
            decoration: const InputDecoration(labelText: 'Email'),
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            decoration: const InputDecoration(labelText: 'Password'),
            obscureText: true,
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _submit, child: Text(_signup ? 'Sign up' : 'Sign in')),
          TextButton(
            onPressed: () => setState(() => _signup = !_signup),
            child: Text(_signup ? 'Have an account? Sign in' : 'Need an account? Sign up'),
          ),
          if (_info != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_info!)),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))),
        ],
      ),
    );
  }
}
