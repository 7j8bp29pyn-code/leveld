import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { assessReadiness, type Assessment, type TrainingOption } from '../domain/readiness';
import type { DailyCheckin } from '../domain/types';
import { Badge, Button, Card, Muted } from './components';
import { colors, font, space } from './theme';

const tone = { A: 'success', B: 'warning', C: 'warning', D: 'warning' } as const;

/** Shows the rule-based assessment of today's check-in (no diagnosis). */
export function ReadinessAdvice({ checkin, assessment }: { checkin?: DailyCheckin; assessment?: Assessment | null }) {
  const { t } = useTranslation();
  const a = assessment ?? assessReadiness(checkin);
  if (!a) return null;
  return (
    <View testID={`readiness-state-${a.state}`}>
      {a.urgent && (
        <Card testID="urgent" style={{ borderColor: colors.danger, borderWidth: 1, backgroundColor: colors.dangerMuted, marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
            <Text style={[font.body, { flex: 1, color: colors.text, fontWeight: '600' }]}>{t('readiness.advice.urgent_medical')}</Text>
          </View>
        </Card>
      )}
      <Badge tone={tone[a.state]} label={t(`readiness.${a.state}`)} />
      {a.advice.filter((k) => k !== 'urgent_medical').map((k) => (
        <Text key={k} style={[font.body, { marginTop: space.sm }]}>{t(`readiness.advice.${k}`)}</Text>
      ))}
      {a.suppressProgression && <Muted style={{ marginTop: space.sm }}>{t('readiness.noProgression')}</Muted>}
    </View>
  );
}

/** Buttons for the training options of the current state; the first one is the recommendation. */
export function TrainingOptions({ assessment, onChoose, busy }: { assessment: Assessment; onChoose: (o: TrainingOption) => void; busy?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.sm, marginTop: space.md }}>
      {assessment.options.map((o, i) => (
        <Button key={o} testID={`option-${o}`} compact kind={i === 0 ? 'primary' : 'secondary'} title={t(`readiness.options.${o}`)} disabled={busy} onPress={() => onChoose(o)} />
      ))}
    </View>
  );
}
