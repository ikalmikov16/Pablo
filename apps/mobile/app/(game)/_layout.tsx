import { Stack } from 'expo-router';

export default function GameLayout() {
  // Back-swipe is disabled while in a game so accidental navigation doesn't
  // interrupt a mid-turn animation sequence.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
    />
  );
}
