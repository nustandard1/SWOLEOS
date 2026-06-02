import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import WorkoutLoggerScreen from '../screens/WorkoutLoggerScreen';

export type RootStackParamList = {
  Tabs: undefined;
  WorkoutLogger: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="WorkoutLogger"
        component={WorkoutLoggerScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
    </Stack.Navigator>
  );
}
