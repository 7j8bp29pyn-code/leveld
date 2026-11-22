import React, { useEffect, useState } from 'react';
import { Platform, Share, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { featuresForLevel, LEVEL_DEFAULTS } from '../../domain/training';
import type { CommunicationStyle, FeatureFlags, Locale, Mode, TrainingLevel } from '../../domain/types';
import { CheckinConsent, LEVELS, STYLES } from '../../ui/profileSteps';
import { LOCALES } from '../../i18n';
import { signOut } from '../../services/auth';
import { getPermission, notificationsSupported, requestPermission, type PermissionState } from '../../services/notifications';
import { useStore } from '../../state/AppStore';
import { Badge, Button, Card, Chip, Field, Muted, Screen, SectionTitle, Segmented } from '../../ui/components';
import { confirm } from '../../ui/confirm';
import { colors, font, space } from '../../ui/theme';

export default function More() {
  const { t } = useTranslation();
  const store = useStore();
  const { profile } = store.data;
  const [name, setName] = useState(profile.displayName);
  const [perm, setPerm] = useState<PermissionState>('unsupported');
  useEffect(() => { getPermission().then(setPerm); }, []);

  const reminderCount = store.data.habits.filter((h) => h.status === 'active' && h.reminderEnabled && h.reminderTime).length;

  async function exportJson() {
    const snap = await store.exportAll();
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'LEVELD', ...snap }, null, 2);
    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `leveld-export-${store.today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      // system share sheet – nothing is sent without the user choosing a target
      await Share.share({ message: json, title: 'LEVELD Export' });
    }
  }

  async function deleteAll() {
    const msg = `${t('more.deleteAllConfirm')}${store.repoKind === 'supabase' ? '\n\n' + t('more.deleteAllCloud') : ''}`;
    if (await confirm(msg)) await store.deleteAllData();
  }

  return (
    <Screen>
      <Text style={font.h1}>{t('more.title')}</Text>

      <SectionTitle>{t('more.profile')}</SectionTitle>
      <Field label={t('more.name')} value={name} onChangeText={setName} onBlur={() => name !== profile.displayName && store.saveProfile({ displayName: name.trim() })} maxLength={80} />
      <Text style={[font.label, { marginBottom: 6 }]}>{t('more.mode')}</Text>
      <Segmented<Mode> testID="mode" value={profile.mode} onChange={(m) => store.saveProfile({ mode: m })}
        options={[{ value: 'guided', label: t('more.guided') }, { value: 'custom', label: t('more.custom') }]} />
      <Muted style={{ marginTop: space.sm }}>
        {profile.mode === 'guided' ? t('onboarding.guidedText', { n: profile.trainingLevel ? LEVEL_DEFAULTS[profile.trainingLevel].startLimit : 3 }) : t('onboarding.customText')}
      </Muted>

      <SectionTitle>{t('level.title')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {LEVELS.map((l: TrainingLevel) => (
          <Chip key={l} testID={`more-level-${l}`} label={t(`level.short.${l}`)} selected={profile.trainingLevel === l}
            onPress={() => store.saveProfile({ trainingLevel: l, features: featuresForLevel(l, profile.features) })} />
        ))}
      </View>
      <Muted>{t('level.hint')}</Muted>
      <View style={{ marginTop: space.sm }}>
        <Button testID="open-setup" compact kind="secondary" title={t('level.setupTitle')} onPress={() => router.push('/setup')} />
      </View>

      <SectionTitle>{t('style.title')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {STYLES.map((st: CommunicationStyle) => (
          <Chip key={st} testID={`more-style-${st}`} label={t(`style.${st}`)} selected={profile.communicationStyle === st}
            onPress={() => store.saveProfile({ communicationStyle: st })} />
        ))}
      </View>

      <SectionTitle>{t('features.title')}</SectionTitle>
      <Muted style={{ marginBottom: space.sm }}>{t('features.hint')}</Muted>
      {(['detailedLogging', 'rpe', 'cycles'] as (keyof FeatureFlags)[]).map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={[font.body, { flex: 1, marginRight: space.md }]}>{t(`features.${k}`)}</Text>
          <Switch testID={`feature-${k}`} value={profile.features[k]} trackColor={{ true: colors.accent, false: colors.border }}
            onValueChange={(v) => { store.saveProfile({ features: { ...profile.features, [k]: v } }); }} />
        </View>
      ))}
      {profile.features.cycles && (
        <View style={{ marginTop: space.sm }}>
          <Button testID="open-cycles" compact kind="secondary" title={t('cycles.title')} onPress={() => router.push('/cycles')} />
        </View>
      )}

      <SectionTitle>{t('steps.title')}</SectionTitle>
      <Card testID="open-steps" onPress={() => router.push('/steps')}>
        <Text style={font.body}>{t('steps.title')} · {t('steps.goal')} {profile.stepSettings.goal.toLocaleString('de-DE')}</Text>
        <Muted>{t('steps.autoHint')}</Muted>
      </Card>

      <SectionTitle>{t('plans.title')}</SectionTitle>
      <Card testID="open-plans" onPress={() => router.push('/plans')}>
        <Text style={font.body}>{t('plans.title')} ({store.data.trainingPlans.length})</Text>
        <Muted>{t('plans.limit')}</Muted>
      </Card>

      <SectionTitle>{t('rhythm.title')}</SectionTitle>
      <Card onPress={() => router.push('/rhythm')} testID="open-rhythm">
        <Text style={font.body}>{t(`rhythm.${profile.dayRhythm}`)}</Text>
        <Muted>{t('rhythm.wake')} {profile.anchors.wake} · {t('rhythm.bedtime')} {profile.anchors.bedtime} · {t('rhythm.dayStart')} {String(profile.dayStartHour).padStart(2, '0')}:00</Muted>
      </Card>

      <SectionTitle>{t('health.title')}</SectionTitle>
      <Card>
        {profile.features.checkin && profile.healthConsentAt ? (
          <>
            <Button testID="more-checkin" compact title={store.data.checkins.some((c) => c.localDate === store.today) ? t('health.checkinDone') : t('health.checkinNow')}
              onPress={() => router.push({ pathname: '/checkin', params: { date: store.today } })} />
            <Muted testID="health-consent" style={{ marginTop: space.md }}>{t('health.consentGiven', { date: profile.healthConsentAt.slice(0, 10) })}</Muted>
            <View style={{ marginTop: space.md }}>
              <Button testID="withdraw-consent" kind="danger" compact title={t('health.withdraw')}
                onPress={async () => { if (await confirm(t('health.withdrawConfirm'))) await store.withdrawHealthConsent(); }} />
            </View>
          </>
        ) : (
          <>
            <Muted>{t('health.none')}</Muted>
            <CheckinConsent value={false}
              onChange={(v) => v && store.saveProfile({ features: { ...profile.features, checkin: true }, healthConsentAt: new Date().toISOString() })} />
          </>
        )}
      </Card>

      <SectionTitle>{t('more.phaseSettings')}</SectionTitle>
      <Text style={[font.label, { marginBottom: 6 }]}>{t('more.threshold')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[0.6, 0.7, 0.8, 0.9, 1].map((v) => <Chip key={v} label={`${Math.round(v * 100)} %`} selected={Math.abs(profile.phaseThreshold - v) < 0.001} onPress={() => store.saveProfile({ phaseThreshold: v })} />)}
      </View>
      <Text style={[font.label, { marginBottom: 6, marginTop: space.sm }]}>{t('more.window')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {[7, 14, 21, 28].map((v) => <Chip key={v} label={String(v)} selected={profile.phaseWindowDays === v} onPress={() => store.saveProfile({ phaseWindowDays: v })} />)}
      </View>
      <Muted>{t('more.thresholdNote')} {t('phase.suggestNote', { threshold: Math.round(profile.phaseThreshold * 100) })}</Muted>

      <SectionTitle>{t('more.notifications')}</SectionTitle>
      <Card>
        {!notificationsSupported ? <Muted>{t('more.notificationsWeb')}</Muted>
          : perm === 'granted' ? <Muted>{t('more.notificationsOn', { n: reminderCount })}</Muted>
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Muted style={{ flex: 1 }}>{t('more.notificationsOff')}</Muted>
                <Button compact kind="secondary" title={t('more.requestPermission')} onPress={async () => setPerm(await requestPermission())} />
              </View>
            )}
      </Card>

      <SectionTitle>{t('more.language')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {LOCALES.map((l) => <Chip key={l.code} label={l.label + (l.ready ? '' : ' *')} selected={profile.locale === l.code} onPress={() => store.saveProfile({ locale: l.code as Locale })} />)}
      </View>
      <Muted>* {t('more.languageNote')}</Muted>

      <SectionTitle>{t('more.storage')}</SectionTitle>
      <Card>
        <Muted testID="storage-info">{store.repoKind === 'local' ? t('more.storageLocal') : t('more.storageCloud', { email: store.email ?? '' })}</Muted>
        {store.repoKind === 'supabase' && <View style={{ marginTop: space.md }}><Button kind="secondary" compact title={t('auth.signOut')} onPress={signOut} /></View>}
      </Card>

      <SectionTitle>{t('more.privacy')}</SectionTitle>
      <View style={{ gap: space.sm }}>
        <Button testID="export-json" kind="secondary" icon="download-outline" title={t('more.exportJson')} onPress={exportJson} />
        <Button testID="delete-all" kind="danger" icon="trash-outline" title={t('more.deleteAll')} onPress={deleteAll} />
      </View>

      <SectionTitle>{t('more.roadmap')}</SectionTitle>
      <Card>
        {Object.keys(t('more.roadmapItems', { returnObjects: true }) as object).map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={[font.body, { color: colors.textMuted, flex: 1 }]}>{t(`more.roadmapItems.${k}`)}</Text>
            <Badge label={t('common.planned')} />
          </View>
        ))}
      </Card>
      <Muted style={{ textAlign: 'center', marginTop: space.xl }}>LEVELD · {t('app.claim')}</Muted>
    </Screen>
  );
}
