import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { C } from '../theme';
import { Btn, Card, Screen } from '../components/ui';

export default function MoreScreen() {
  const { user, serverUrl, logout } = useAuth();
  const row = (k: string, v: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line }}>
      <Text style={{ color: C.soft }}>{k}</Text>
      <Text style={{ color: C.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
  return (
    <Screen title="More">
      <ScrollView contentContainerStyle={{ padding: 12, paddingTop: 0, gap: 12, maxWidth: 640 }}>
        <Card style={{ paddingHorizontal: 14 }}>
          {row('Signed in as', user?.name ?? '')}
          {row('Username', user?.username ?? '')}
          {row('Role', user?.roleKey ?? '')}
          {row('Server', serverUrl || 'this site')}
        </Card>
        <Btn title="Sign out" variant="ghost" onPress={logout} />
        <Text style={{ color: C.soft, fontSize: 12 }}>To change the server address, sign out and edit it on the sign-in screen.</Text>
        <Text style={{ color: C.soft, fontSize: 12 }}>Reports, stock, menu prices and settings are in the web app.</Text>
      </ScrollView>
    </Screen>
  );
}
