import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MusicageApp } from './src/app/MusicageApp';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MusicageApp />
    </SafeAreaProvider>
  );
}
