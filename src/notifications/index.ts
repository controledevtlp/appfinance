import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatBRL } from '@/engine/money';
import type { MonthSummary, NotificationPrefs } from '@/engine/types';

const supported = Platform.OS !== 'web';
const CHANNEL = 'financas';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Alertas financeiros',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

/** Reagenda os lembretes recorrentes conforme as preferências. */
export async function syncRecurringNotifications(prefs: NotificationPrefs): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync('weekly-summary');
    await Notifications.cancelScheduledNotificationAsync('daily-reminder');
    if (!prefs.weeklySummary && !prefs.dailyReminder) return;
    if (!(await ensureNotificationPermission())) return;
    if (prefs.weeklySummary) {
      await Notifications.scheduleNotificationAsync({
        identifier: 'weekly-summary',
        content: { title: 'Resumo da semana', body: 'Veja como estão seus gastos e as dicas para economizar.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 19, minute: 0, channelId: CHANNEL },
      });
    }
    if (prefs.dailyReminder) {
      await Notifications.scheduleNotificationAsync({
        identifier: 'daily-reminder',
        content: { title: 'Registrou seus gastos de hoje?', body: 'Leva 30 segundos e mantém o orçamento em dia.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 30, channelId: CHANNEL },
      });
    }
  } catch {
    // Ambientes sem suporte (ex.: Expo Go) simplesmente não agendam.
  }
}

const LEVEL = { ok: 0, warning: 1, over: 2 } as const;

/**
 * Avisa quando uma categoria chega a 80% ou passa de 100% do limite.
 * Guarda o último nível avisado por categoria/mês para não repetir a notificação.
 */
export async function notifyBudgetAlerts(summary: MonthSummary, enabled: boolean): Promise<void> {
  if (!supported || !enabled) return;
  const key = `fc:alerts:${summary.month}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const notified: Record<string, number> = raw ? JSON.parse(raw) : {};
    const pending = summary.categories.filter((u) => LEVEL[u.status] > (notified[u.category.id] ?? 0));
    if (!pending.length) return;
    if (!(await ensureNotificationPermission())) return;
    for (const u of pending) {
      notified[u.category.id] = LEVEL[u.status];
      const over = u.status === 'over';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: over ? `${u.category.name}: limite estourado` : `${u.category.name}: ${Math.round(u.ratio * 100)}% do limite`,
          body: over
            ? `Você gastou ${formatBRL(u.spentCents)} de ${formatBRL(u.limitCents)}. Veja o plano de redução na aba Dicas.`
            : `Já foram ${formatBRL(u.spentCents)} de ${formatBRL(u.limitCents)} neste mês. Segure um pouco.`,
        },
        trigger: null,
      });
    }
    await AsyncStorage.setItem(key, JSON.stringify(notified));
  } catch {
    // não bloqueia o app por causa de notificação
  }
}
