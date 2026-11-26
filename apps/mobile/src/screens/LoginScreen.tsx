import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { C } from '../theme';
import { Btn, ErrorNote, Input } from '../components/ui';

export default function LoginScreen() {
  const { login, serverUrl } = useAuth();
  const [server, setServer] = useState(serverUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    setError(null);
    const url = server.trim();
    if (Platform.OS !== 'web' && !/^https?:\/\/.+/i.test(url)) { setError(new ApiError(0, 'Enter the server address, for example https://your-domain or http://192.168.1.10:4000')); return; }
    if (!username.trim() || !password) { setError(new ApiError(0, 'Enter username and password.')); return; }
    setBusy(true);
    try { await login(username, password, url); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 22, gap: 14 }}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: C.forest, letterSpacing: 1 }}>AMMAS</Text>
            <Text style={{ color: C.soft }}>Coimbatore {'\u00b7'} Sign in to take orders</Text>
          </View>
          <Input label="Server address (saved on this device)" value={server} onChangeText={setServer} placeholder="http://192.168.1.10:4000" keyboardType="url" />
          <Input label="Username" value={username} onChangeText={setUsername} autoComplete="username" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
          <ErrorNote error={error} />
          <Btn title="Sign in" size="lg" onPress={submit} busy={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
