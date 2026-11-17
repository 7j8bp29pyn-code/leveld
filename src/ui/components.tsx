import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../state/AppStore';
import { colors, font, radius, space } from './theme';

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = padded ? { padding: space.lg, paddingBottom: space.xxl * 2 } : undefined;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title, onPress, kind = 'primary', disabled, loading, icon, testID, compact,
}: {
  title: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap; testID?: string; compact?: boolean;
}) {
  const bg = { primary: colors.accent, secondary: colors.surfaceRaised, ghost: 'transparent', danger: colors.dangerMuted }[kind];
  const fg = { primary: colors.onAccent, secondary: colors.text, ghost: colors.accent, danger: colors.danger }[kind];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button, compact && s.buttonCompact, { backgroundColor: bg },
        kind === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        (disabled || loading) && { opacity: 0.45 }, pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} style={{ marginRight: 6 }} />}
          <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={[s.chip, selected && { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
    >
      <Text style={[s.chipText, selected && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      {label && <Text style={[font.label, { marginBottom: 6 }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        {...props}
        style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, error && { borderColor: colors.danger }, props.style]}
      />
      {error ? <Text style={[font.small, { color: colors.danger, marginTop: 4 }]}>{error}</Text> : hint ? <Text style={[font.small, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, testID }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string;
}) {
  return (
    <View style={s.segmented} testID={testID}>
      {options.map((o) => (
        <Pressable
          key={String(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onChange(o.value)}
          style={[s.segment, o.value === value && { backgroundColor: colors.surfaceRaised }]}
        >
          <Text style={[s.segmentText, o.value === value && { color: colors.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm }}>
      <Text style={font.label}>{children}</Text>
      {right}
    </View>
  );
}

export function ProgressBar({ value, height = 6 }: { value: number | null; height?: number }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height, backgroundColor: colors.accent, borderRadius: height }} />
    </View>
  );
}

export function HabitIcon({ name, size = 20, done }: { name: string; size?: number; done?: boolean }) {
  const glyph = (name in Ionicons.glyphMap ? name : 'ellipse-outline') as keyof typeof Ionicons.glyphMap;
  return (
    <View style={[s.icon, { width: size + 18, height: size + 18 }, done && { backgroundColor: colors.successMuted }]}>
      <Ionicons name={glyph} size={size} color={done ? colors.success : colors.textMuted} />
    </View>
  );
}

export function Muted({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<TextStyle>; testID?: string }) {
  return <Text testID={testID} style={[font.small, style]}>{children}</Text>;
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' }) {
  const c = { neutral: colors.textMuted, accent: colors.accent, success: colors.success, warning: colors.warning }[tone];
  return (
    <View style={[s.badge, { borderColor: c }]}>
      <Text style={{ color: c, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function ToastHost() {
  const { toast, dismissToast } = useStore();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, toast.action ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);
  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={s.toastWrap}>
      <View accessibilityRole="alert" testID="toast" style={[s.toast, toast.kind === 'error' && { borderColor: colors.danger }]}>
        <Text style={[font.body, { flex: 1 }]}>{toast.message}</Text>
        {toast.action && (
          <Pressable onPress={() => { toast.action!.run(); dismissToast(); }} style={{ paddingHorizontal: space.sm }}>
            <Text style={{ color: colors.accent, fontWeight: '600' }}>{toast.action.label}</Text>
          </Pressable>
        )}
        <Pressable onPress={dismissToast} accessibilityLabel="close"><Ionicons name="close" size={18} color={colors.textMuted} /></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  buttonCompact: { minHeight: 38, paddingHorizontal: space.md },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginRight: space.sm, marginBottom: space.sm },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, color: colors.text, fontSize: 15 },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.sm },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  icon: { borderRadius: radius.md, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center', paddingHorizontal: space.lg },
  toast: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, maxWidth: 520, width: '100%' },
});
