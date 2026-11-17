import React, { useEffect, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Locale, Mode } from '../../domain/types';
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
      <Muted style={{ marginTop: space.sm }}>{profile.mode === 'guided' ? t('onboarding.guidedText') : t('onboarding.customText')}</Muted>

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
