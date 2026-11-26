import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './src/lib/auth';
import { C } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import Shell from './src/Shell';
import { ToastHost } from './src/components/ui';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true } },
});

function Gate() {
  const { status } = useAuth();
  if (status === 'loading') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}><ActivityIndicator size="large" color={C.forest} /></View>;
  if (status === 'out') return <><LoginScreen /><ToastHost /></>;
  return <Shell />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.card }} edges={['top', 'bottom', 'left', 'right']}>
            <StatusBar style="dark" />
            <Gate />
          </SafeAreaView>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
