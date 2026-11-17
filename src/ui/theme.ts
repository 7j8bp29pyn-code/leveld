/** LEVELD design tokens – dark anthracite, light type, one restrained accent. */
export const colors = {
  bg: '#15171A',
  surface: '#1E2125',
  surfaceRaised: '#262A2F',
  border: '#32373D',
  text: '#F1F0EC',
  textMuted: '#9DA3AA',
  textFaint: '#6E747B',
  accent: '#C8B07E', // muted champagne
  accentMuted: 'rgba(200,176,126,0.14)',
  onAccent: '#15171A',
  success: '#8DB89A',
  successMuted: 'rgba(141,184,154,0.14)',
  warning: '#D8B36A',
  danger: '#D88A7E',
  dangerMuted: 'rgba(216,138,126,0.14)',
  info: '#8FA9C4',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = {
  h1: { fontSize: 28, fontWeight: '600' as const, letterSpacing: -0.4, color: colors.text },
  h2: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.2, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  small: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const },
} as const;

/** Icons users can choose for activities (Ionicons names). */
export const HABIT_ICONS = [
  'ellipse-outline', 'barbell-outline', 'walk-outline', 'bicycle-outline', 'water-outline', 'tennisball-outline',
  'body-outline', 'leaf-outline', 'moon-outline', 'book-outline', 'school-outline', 'restaurant-outline',
  'nutrition-outline', 'medkit-outline', 'heart-outline', 'flame-outline', 'musical-notes-outline', 'brush-outline',
  'sunny-outline', 'cafe-outline', 'timer-outline', 'trophy-outline', 'flash-outline', 'happy-outline',
] as const;

export const CATEGORIES = ['training', 'movement', 'mind', 'sleep', 'nutrition', 'health', 'learning', 'general'] as const;
