import { Alert, Platform } from 'react-native';
import i18n from '../i18n';

/** Cross-platform confirmation dialog (Alert has no buttons on web). */
export function confirm(message: string, destructiveLabel = i18n.t('common.delete')): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? false);
  return new Promise((resolve) =>
    Alert.alert('', message, [
      { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: destructiveLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
