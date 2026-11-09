import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MusicageApp } from './src/app/MusicageApp';
import { useChromeFonts } from './src/theme/chromeFonts';

export default function App() {
  // Not awaited: the chrome shows in the system font and swaps once loaded.
  const chromeFonts = useChromeFonts();
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MusicageApp chromeFonts={chromeFonts} />
    </SafeAreaProvider>
  );
}
