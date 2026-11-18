import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { validatePlanUpload, ValidationError } from '../domain/entries';
import type { TrainingPlan } from '../domain/types';
import { readBytes } from '../services/files';
import { useStore } from '../state/AppStore';
import { Button, Card, Field, Muted, Screen, SectionTitle } from '../ui/components';
import { confirm } from '../ui/confirm';
import { formatDate } from '../ui/format';
import { colors, font, space } from '../ui/theme';

interface Picked { uri: string; name: string; mimeType: string; size: number }

/** Upload & view existing training plans (photo / PDF). Recognition by AI is not implemented yet. */
export default function PlansScreen() {
  const { t } = useTranslation();
  const store = useStore();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cloud = store.repoKind === 'supabase';

  async function upload(file: Picked) {
    setError(null);
    try {
      validatePlanUpload({ title, fileName: file.name, mimeType: file.mimeType, size: file.size || 1 });
    } catch (e) {
      setError(e instanceof ValidationError ? t(`errors.${e.message}`) : String(e));
      return;
    }
    setBusy(true);
    try {
      const bytes = await readBytes(file.uri);
      const ok = await store.uploadPlan({ title, fileName: file.name, mimeType: file.mimeType, bytes });
      if (ok) {
        setTitle('');
        store.showToast(t('plans.uploaded'), 'success');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickPdf() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    await upload({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? '', size: a.size ?? 0 });
  }

  async function pickImage(camera: boolean) {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError(t('plans.cameraDenied'));
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    await upload({ uri: a.uri, name: a.fileName ?? 'plan.jpg', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? 0 });
  }

  async function open(p: TrainingPlan) {
    const url = await store.openPlanUrl(p);
    if (url) await WebBrowser.openBrowserAsync(url);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('plans.title') }} />
      <Muted style={{ marginBottom: space.md }}>{t('plans.hint')}</Muted>
      <Card style={{ marginBottom: space.md }}>
        <Muted>{t('plans.aiSoon')}</Muted>
      </Card>

      {!cloud ? (
        <Muted testID="plans-local">{t('plans.localOnly')}</Muted>
      ) : (
        <>
          <Field label={t('plans.name')} value={title} onChangeText={setTitle} placeholder={t('plans.namePlaceholder')} maxLength={120} />
          <View style={{ gap: space.sm }}>
            {Platform.OS !== 'web' && <Button icon="camera-outline" title={t('plans.photo')} onPress={() => pickImage(true)} disabled={busy} />}
            <Button kind="secondary" icon="images-outline" title={t('plans.library')} onPress={() => pickImage(false)} disabled={busy} />
            <Button kind="secondary" icon="document-outline" title={t('plans.pdf')} onPress={pickPdf} disabled={busy} loading={busy} />
          </View>
          <Muted style={{ marginTop: space.sm }}>{busy ? t('plans.uploading') : t('plans.limit')}</Muted>
          {error && <Muted style={{ color: colors.danger, marginTop: space.sm }}>{error}</Muted>}
        </>
      )}

      <SectionTitle>{t('plans.title')}</SectionTitle>
      {store.data.trainingPlans.length === 0 && <Muted>{t('plans.empty')}</Muted>}
      {store.data.trainingPlans.map((p) => (
        <Card key={p.id} style={{ marginBottom: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Ionicons name={p.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={24} color={colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={1}>{p.title}</Text>
            <Muted>{formatDate(p.createdAt.slice(0, 10))} · {Math.max(1, Math.round(p.sizeBytes / 1024))} KB</Muted>
          </View>
          <Button compact kind="secondary" title={t('plans.open')} onPress={() => open(p)} />
          <Pressable accessibilityLabel={t('common.delete')} hitSlop={8}
            onPress={async () => { if (await confirm(t('plans.deleteConfirm', { name: p.title }))) await store.deletePlan(p); }}>
            <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}
