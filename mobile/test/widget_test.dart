import 'package:flutter_test/flutter_test.dart';

import 'package:league_fan_mobile/main.dart';

void main() {
  testWidgets('App shows config hint when Supabase is not configured', (WidgetTester tester) async {
    await tester.pumpWidget(const LeagueFanApp(supabaseReady: false));
    expect(find.textContaining('Missing Supabase config'), findsOneWidget);
  });
}
