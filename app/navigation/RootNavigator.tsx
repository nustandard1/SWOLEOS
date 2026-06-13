import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import WorkoutLoggerScreen from '../screens/WorkoutLoggerScreen';
import SplitPickerScreen from '../screens/SplitPickerScreen';
import TemplateBuilderScreen from '../screens/TemplateBuilderScreen';
import TemplateSessionBuilderScreen from '../screens/TemplateSessionBuilderScreen';
import IntelligenceScreen from '../screens/IntelligenceScreen';

export type RootStackParamList = {
  Tabs: undefined;
  WorkoutLogger: { templateSessionId?: string; templateId?: string; editSessionId?: string } | undefined;
  SplitPicker: { splitId?: string } | undefined;
  TemplateBuilder: { splitId: string; templateId?: string };
  TemplateSessionBuilder: { templateId: string; sessionId: string; sessionName: string; splitId: string; sessionIndex: number };
  Intelligence: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator({ startTab, startSegment }: { startTab?: string; startSegment?: string | null } = {}) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs">
        {() => <TabNavigator initialTab={startTab} initialSegment={startSegment} />}
      </Stack.Screen>
      <Stack.Screen
        name="WorkoutLogger"
        component={WorkoutLoggerScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="SplitPicker"
        component={SplitPickerScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="TemplateBuilder"
        component={TemplateBuilderScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="TemplateSessionBuilder"
        component={TemplateSessionBuilderScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="Intelligence"
        component={IntelligenceScreen}
        options={{ presentation: 'fullScreenModal' }}
      />
    </Stack.Navigator>
  );
}
