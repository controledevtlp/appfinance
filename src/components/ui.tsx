import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from '@/engine/categories';
import { monthLabel, shiftMonth } from '@/engine/dates';
import type { TxType } from '@/engine/types';
import { glassShadow, radius, space, useTheme } from '@/theme';
import { Backdrop, Glass, GradientPill } from './glass';
import { Press } from './motion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Vibração curta ao tocar. Só no celular; no navegador não existe. */
export function tap() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name as IconName} size={size} color={color ?? t.text} />;
}

export function Card({ children, style, tone, strength }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: [string, string]; strength?: number }) {
  return (
    <Glass tone={tone} strength={strength} style={style}>
      <View style={{ padding: space.lg, gap: space.md }}>{children}</View>
    </Glass>
  );
}

type Variant = 'title' | 'h2' | 'body' | 'muted' | 'big' | 'small' | 'hero' | 'label';
export function Txt({
  children,
  variant = 'body',
  color,
  style,
  numberOfLines,
  onPress,
  adjustsFontSizeToFit,
  minimumFontScale,
}: {
  children: ReactNode;
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onPress?: () => void;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}) {
  const t = useTheme();
  const base: Record<Variant, TextStyle> = {
    hero: { fontSize: 40, fontWeight: '800', color: t.textStrong, letterSpacing: -1.2 },
    big: { fontSize: 30, fontWeight: '800', color: t.textStrong, letterSpacing: -0.8 },
    title: { fontSize: 21, fontWeight: '700', color: t.textStrong, letterSpacing: -0.4 },
    h2: { fontSize: 16, fontWeight: '700', color: t.textStrong, letterSpacing: -0.2 },
    body: { fontSize: 15, color: t.text },
    muted: { fontSize: 13, color: t.muted },
    small: { fontSize: 12, color: t.muted, lineHeight: 17 },
    label: { fontSize: 11, fontWeight: '700', color: t.muted, letterSpacing: 0.8, textTransform: 'uppercase' },
  };
  return (
    <Text
      onPress={onPress}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      style={[base[variant], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const fg = variant === 'primary' ? t.primaryText : variant === 'danger' ? '#fff' : t.primary;
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 18 }}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15, letterSpacing: -0.2 }}>{title}</Text>
    </View>
  );

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || loading}
      style={[{ opacity: disabled ? 0.45 : 1, borderRadius: radius.md }, style]}>
      {variant === 'primary' ? (
        <GradientPill radius={radius.md} style={glassShadow(t, 0.7)}>
          {inner}
        </GradientPill>
      ) : (
        <View
          style={{
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: variant === 'danger' ? t.over : t.border,
            backgroundColor: variant === 'danger' ? t.over : t.fieldBg,
          }}>
          {inner}
        </View>
      )}
    </Press>
  );
}

export function Chip({ label, selected, onPress, color, icon }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: string }) {
  const t = useTheme();
  const c = color ?? t.primary;
  return (
    <Press
      onPress={() => {
        tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? c : t.border,
        backgroundColor: selected ? c : t.fieldBg,
      }}>
      {icon ? <Icon name={icon} size={14} color={selected ? t.primaryText : t.muted} /> : null}
      <Text style={{ color: selected ? t.primaryText : t.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Press>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const t = useTheme();
  const arrow = (delta: number, icon: string, label: string) => (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onChange(shiftMonth(month, delta));
      }}
      hitSlop={10}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.fieldBg,
        borderWidth: 1,
        borderColor: t.border,
      }}>
      <Icon name={icon} size={18} color={t.primary} />
    </Press>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
      {arrow(-1, 'chevron-back', 'Mês anterior')}
      <Txt variant="h2" style={{ fontSize: 17 }}>{monthLabel(month)}</Txt>
      {arrow(1, 'chevron-forward', 'Próximo mês')}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">{label}</Txt>
      <TextInput
        placeholderTextColor={t.faint}
        {...props}
        style={[
          {
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.fieldBg,
            color: t.text,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontSize: 16,
          },
          props.style,
        ]}
      />
      {hint ? <Txt variant="small">{hint}</Txt> : null}
    </View>
  );
}

/** Campo de valor em reais, com prefixo e teclado numérico. */
export function MoneyField({
  label,
  value,
  onChangeText,
  hint,
  autoFocus,
  big,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  autoFocus?: boolean;
  big?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt variant="label">{label}</Txt> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.fieldBg,
          borderRadius: radius.md,
          paddingHorizontal: 14,
        }}>
        <Text style={{ color: t.muted, fontSize: big ? 22 : 16, fontWeight: '700', marginRight: 6 }}>R$</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          placeholderTextColor={t.faint}
          autoFocus={autoFocus}
          style={{
            flex: 1,
            color: t.textStrong,
            fontSize: big ? 28 : 16,
            fontWeight: big ? '800' : '400',
            letterSpacing: big ? -0.8 : 0,
            paddingVertical: 13,
          }}
        />
      </View>
      {hint ? <Txt variant="small">{hint}</Txt> : null}
    </View>
  );
}

export function Screen({ children, padBottom = 150 }: { children: ReactNode; padBottom?: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: padBottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center' }}>
      <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
        <GradientPill style={{ width: 66, height: 66, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={30} color={t.primaryText} />
        </GradientPill>
        <Txt variant="title">{title}</Txt>
        <Txt variant="muted" style={{ textAlign: 'center' }}>{text}</Txt>
        {children}
      </View>
    </Card>
  );
}

export function CategoryBadge({ categoryId, size = 40 }: { categoryId: string; size?: number }) {
  const t = useTheme();
  const c = getCategory(categoryId);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3.2,
        backgroundColor: t.badgeBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Icon name={c.icon} size={size * 0.46} color={t.badgeIcon} />
    </View>
  );
}

/** Seletor de categoria em folha inferior. */
export function CategoryPicker({
  visible,
  type,
  value,
  onSelect,
  onClose,
  allowAll,
}: {
  visible: boolean;
  type: TxType;
  value?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Mostra receitas e despesas juntas, para corrigir uma linha lida com o sinal errado. */
  allowAll?: boolean;
}) {
  const t = useTheme();
  const list = allowAll ? [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] : type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          style={{
            backgroundColor: t.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderWidth: 1,
            borderColor: t.cardBorder,
            maxHeight: '75%',
            paddingBottom: 24,
            overflow: 'hidden',
          }}
          onPress={() => {}}>
          <Backdrop />
          <View style={{ padding: space.lg, gap: 2 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 10 }} />
            <Txt variant="h2">Escolhe a categoria</Txt>
            {allowAll ? <Txt variant="small">Escolhendo uma de receita, a linha vira entrada.</Txt> : null}
          </View>
          <ScrollView>
            {list.map((c) => (
              <Press
                key={c.id}
                onPress={() => {
                  tap();
                  onSelect(c.id);
                  onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 11,
                  paddingHorizontal: space.lg,
                  backgroundColor: value === c.id ? t.soft : 'transparent',
                }}>
                <CategoryBadge categoryId={c.id} size={36} />
                <Txt style={{ flex: 1 }}>{c.name}</Txt>
                {value === c.id ? <Icon name="checkmark-circle" color={t.primary} /> : null}
              </Press>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Pequeno estado local para controlar um modal. */
export function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return { on, open: () => setOn(true), close: () => setOn(false) };
}
