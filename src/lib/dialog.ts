import { Alert, Platform } from 'react-native';

/** Aviso simples. No celular usa o Alert nativo; na web, window.alert (o Alert do RN não funciona no navegador). */
export function notify(title: string, message?: string, onOk?: () => void): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    onOk?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
}

export function confirmDialog(title: string, message: string, onConfirm: () => void, opts: { destructive?: boolean; confirmText?: string } = {}): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: opts.confirmText ?? 'Confirmar', style: opts.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
