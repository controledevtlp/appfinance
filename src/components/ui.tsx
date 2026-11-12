import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { shiftMonth, monthLabel } from '@/engine/dates';
import type { TxType } from '@/engine/types';
import { radius, space, useTheme } from '@/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: string; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name as IconName} size={size} color={color ?? t.text} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: space.lg, gap: space.md }, style]}>{children}</View>;
}

type Variant = 'title' | 'h2' | 'body' | 'muted' | 'big' | 'small';
export function Txt({ children, variant = 'body', color, style, numberOfLines }: { children: ReactNode; variant?: Variant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const t = useTheme();
  const base: Record<Variant, TextStyle> = {
    title: { fontSize: 22, fontWeight: '700', color: t.text },
    h2: { fontSize: 16, fontWeight: '700', color: t.text },
    body: { fontSize: 15, color: t.text },
    muted: { fontSize: 13, color: t.muted },
    small: { fontSize: 12, color: t.muted },
    big: { fontSize: 32, fontWeight: '800', color: t.text, letterSpacing: -0.5 },
  };
  return <Text numberOfLines={numberOfLines} style={[base[variant], color ? { color } : null, style]}>{children}</Text>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style }: { title: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; icon?: string; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.over : 'transparent';
  const fg = variant === 'primary' ? t.primaryText : variant === 'danger' ? '#fff' : t.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: t.border },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color, icon }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: string }) {
  const t = useTheme();
  const c = color ?? t.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? c : t.border, backgroundColor: selected ? c : 'transparent' }}>
      {icon ? <Icon name={icon} size={14} color={selected ? t.primaryText : t.muted} /> : null}
      <Text style={{ color: selected ? t.primaryText : t.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const t = useTheme();
  const btn = (delta: number, icon: string, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => onChange(shiftMonth(month, delta))} hitSlop={10} style={{ padding: 8 }}>
      <Icon name={icon} size={22} color={t.primary} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {btn(-1, 'chevron-back', 'Mês anterior')}
      <Txt variant="h2">{monthLabel(month)}</Txt>
      {btn(1, 'chevron-forward', 'Próximo mês')}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="muted">{label}</Txt>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[{ borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, color: t.text, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }, props.style]}
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
      {label ? <Txt variant="muted">{label}</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, borderRadius: radius.md, paddingHorizontal: 14 }}>
        <Text style={{ color: t.muted, fontSize: big ? 22 : 16, fontWeight: '600', marginRight: 6 }}>R$</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          placeholderTextColor={t.muted}
          autoFocus={autoFocus}
          style={{ flex: 1, color: t.text, fontSize: big ? 26 : 16, fontWeight: big ? '800' : '400', paddingVertical: big ? 12 : 12 }}
        />
      </View>
      {hint ? <Txt variant="small">{hint}</Txt> : null}
    </View>
  );
}

export function Screen({ children, padBottom = 32 }: { children: ReactNode; padBottom?: number }) {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: padBottom }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
      <Icon name={icon} size={36} color={t.primary} />
      <Txt variant="h2">{title}</Txt>
      <Txt variant="muted" style={{ textAlign: 'center' }}>{text}</Txt>
      {children}
    </Card>
  );
}

export function CategoryBadge({ categoryId, size = 40 }: { categoryId: string; size?: number }) {
  const t = useTheme();
  const c = getCategory(categoryId);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={c.icon} size={size * 0.5} color={t.primary} />
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
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: t.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '75%', paddingBottom: 24 }} onPress={() => {}}>
          <View style={{ padding: space.lg, borderBottomWidth: 1, borderColor: t.border }}>
            <Txt variant="h2">Escolha a categoria</Txt>
            {allowAll ? <Txt variant="small">Escolher uma categoria de receita transforma a linha em entrada.</Txt> : null}
          </View>
          <ScrollView>
            {list.map((c) => (
              <Pressable key={c.id} onPress={() => { onSelect(c.id); onClose(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: space.lg, backgroundColor: value === c.id ? t.soft : 'transparent' }}>
                <CategoryBadge categoryId={c.id} size={34} />
                <Txt style={{ flex: 1 }}>{c.name}</Txt>
                {value === c.id ? <Icon name="checkmark" color={t.primary} /> : null}
              </Pressable>
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
