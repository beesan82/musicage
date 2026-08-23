import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function MusicageApp() {
  return (
    <SafeAreaView style={styles.root} testID="musicage-root">
      <View style={styles.wordmarkRow}>
        <Text style={styles.wordmark}>MUSICAGE</Text>
        <Text style={styles.status}>IDLE</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#101112',
  },
  wordmarkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  wordmark: {
    color: '#F4F0E6',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
  },
  status: {
    color: '#A9AAA4',
    fontSize: 10,
    letterSpacing: 2,
  },
});
