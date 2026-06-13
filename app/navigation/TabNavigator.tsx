import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import SwipeSheet from '../components/SwipeSheet';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TrainScreen from '../screens/TrainScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { supabase } from '../lib/supabase';
import { buildSchedule } from '../lib/schedule';
import { SPLIT_DEFINITIONS } from '../lib/splitDefinitions';
import { colors, fonts } from '../theme/forge';

const Tab = createBottomTabNavigator();

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  Home:    { active: 'home',            inactive: 'home-outline' },
  History: { active: 'clock',           inactive: 'clock-outline' },
  Profile: { active: 'account-circle',  inactive: 'account-circle-outline' },
  Train:   { active: 'lightning-bolt',  inactive: 'lightning-bolt-outline' },
};

// FAB placeholder screen — never actually shown, FAB opens Logger directly
function EmptyScreen() { return <View style={{ flex: 1, backgroundColor: colors.bg }} />; }

// Action sheet row
function MenuRow({ icon, title, sub, onPress, accent }: { icon: IconName; title: string; sub?: string; onPress: () => void; accent?: boolean }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.rowIcon, accent && s.rowIconAccent]}>
        <MaterialCommunityIcons name={icon} size={20} color={accent ? colors.onAcc : colors.acc} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.dim} />
    </TouchableOpacity>
  );
}

function FABButton() {
  const navigation = useNavigation<any>();
  const [open, setOpen] = useState(false);
  const [programParams, setProgramParams] = useState<any>(undefined);
  const [programName, setProgramName] = useState('');

  // Open the menu INSTANTLY; resolve today's program session in the background
  // (the "Today's session" row pops in a beat later instead of blocking the tap).
  function openMenu() {
    setProgramParams(undefined);
    setProgramName('');
    setOpen(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('workout_templates')
        .select(`id, split_type, current_session_index,
          template_sessions(id, name, session_order, scheduled_dow, template_session_exercises(id))`)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const sessions = [...(data.template_sessions || [])].sort((a, b) => a.session_order - b.session_order);
      const dpw = SPLIT_DEFINITIONS.find(sd => sd.id === data.split_type)?.daysPerWeek;
      const dowMap = buildSchedule(sessions, dpw);
      const todaySess = dowMap[(new Date().getDay() + 6) % 7];
      const pick = (todaySess && (todaySess.template_session_exercises?.length ?? 0) > 0)
        ? todaySess
        : sessions[(data.current_session_index ?? 0) % (sessions.length || 1)];
      if (pick && (pick.template_session_exercises?.length ?? 0) > 0) {
        setProgramParams({ templateSessionId: pick.id, templateId: data.id });
        setProgramName(pick.name || 'Next session');
      }
    })();
  }

  function go(fn: () => void) { setOpen(false); setTimeout(fn, 180); } // let the sheet dismiss first

  return (
    <>
      <TouchableOpacity style={s.fab} onPress={openMenu} activeOpacity={0.85}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      <SwipeSheet visible={open} onClose={() => setOpen(false)} keyboardAvoid={false}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>START OR CREATE</Text>

          {programParams && (
            <MenuRow
              icon="play" accent
              title="TODAY'S SESSION"
              sub={programName}
              onPress={() => go(() => navigation.navigate('WorkoutLogger', programParams))}
            />
          )}
          <MenuRow
            icon="plus-circle-outline"
            title="EMPTY SESSION"
            sub="Freeform — log anything"
            onPress={() => go(() => navigation.navigate('WorkoutLogger', undefined))}
          />
          <MenuRow
            icon="hammer"
            title="BUILD A PROGRAM"
            sub="Create a template from a split"
            onPress={() => go(() => navigation.navigate('SplitPicker'))}
          />
          <MenuRow
            icon="star-four-points"
            title="BROWSE PRO PROGRAMS"
            sub="Expert programs with video demos"
            onPress={() => go(() => navigation.navigate('Train', { segment: 'programs' }))}
          />

          <TouchableOpacity style={s.cancel} onPress={() => setOpen(false)}>
            <Text style={s.cancelText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </SwipeSheet>
    </>
  );
}

export default function TabNavigator({ initialTab, initialSegment }: { initialTab?: string; initialSegment?: string | null } = {}) {
  return (
    <Tab.Navigator
      initialRouteName={initialTab || 'Home'}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: s.tabBar,
        tabBarActiveTintColor: colors.acc,
        tabBarInactiveTintColor: colors.dim,
        tabBarLabelStyle: s.tabLabel,
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'Start') return null;
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          return <MaterialCommunityIcons name={focused ? icons.active : icons.inactive} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"    component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen
        name="Start"
        component={EmptyScreen}
        options={{
          tabBarLabel: '',
          tabBarButton: () => <FABButton />,
        }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Train"   component={TrainScreen} initialParams={{ segment: initialSegment }} />
    </Tab.Navigator>
  );
}

const s = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surf,
    borderTopWidth: 1.5,
    borderTopColor: colors.line,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  fab: {
    width: 52, height: 52,
    backgroundColor: colors.acc,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  fabText: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.onAcc,
    lineHeight: 32,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surf, borderTopWidth: 1.5, borderTopColor: colors.line2, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontFamily: fonts.bodySemi, fontSize: 10, color: colors.muted, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 10, marginLeft: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12, borderTopWidth: 1.5, borderTopColor: colors.line },
  rowIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  rowIconAccent: { backgroundColor: colors.acc },
  rowTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.3 },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 1 },
  cancel: { marginTop: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: colors.line2, borderRadius: 10 },
  cancelText: { fontFamily: fonts.display, fontSize: 14, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
});
