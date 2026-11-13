import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from '@/engine/categories';
import { monthLabel, shiftMonth } from '@/engine/dates';
import type { TxType } from '@/engine/types';
import { LinearGradient } from 'expo-linear-gradient';
import { currentMonthKey } from '@/engine/dates';
import { font, glassShadow, radius, space, useTheme, withFont } from '@/theme';
import { Backdrop, Glass, GradientPill, useHasBackdrop } from './glass';
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

type Variant = 'display' | 'title' | 'h2' | 'body' | 'muted' | 'big' | 'small' | 'hero' | 'label';
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
    hero: { fontSize: 38, lineHeight: 46, fontWeight: '800', color: t.textStrong, letterSpacing: -1.4 },
    display: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: t.textStrong, letterSpacing: -0.9 },
    big: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: t.textStrong, letterSpacing: -0.8 },
    title: { fontSize: 21, lineHeight: 27, fontWeight: '700', color: t.textStrong, letterSpacing: -0.4 },
    h2: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: t.textStrong, letterSpacing: -0.2 },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: t.text },
    muted: { fontSize: 13, lineHeight: 19, fontWeight: '500', color: t.muted },
    small: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: t.muted },
    label: { fontSize: 10.5, lineHeight: 15, fontWeight: '700', color: t.muted, letterSpacing: 1.1, textTransform: 'uppercase' },
  };
  // O peso vira nome de família: ver o comentário de `fonts` no tema.
  const flat = withFont((StyleSheet.flatten([base[variant], color ? { color } : null, style]) ?? {}) as TextStyle);
  return (
    <Text
      onPress={onPress}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      style={flat}>
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
      <Text style={{ color: fg, ...font('700'), fontSize: 15, letterSpacing: -0.2 }}>{title}</Text>
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
      <Text style={{ color: selected ? t.primaryText : t.text, fontSize: 13, ...font(selected ? '700' : '600') }}>{label}</Text>
    </Press>
  );
}

/**
 * Seletor de mês em formato de pílula. Tocar no nome do mês volta pra hoje,
 * que é o atalho que mais faz falta depois de passear pelos meses antigos.
 */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const t = useTheme();
  const isCurrent = month === currentMonthKey();
  const arrow = (delta: number, icon: string, label: string) => (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onChange(shiftMonth(month, delta));
      }}
      hitSlop={8}
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: t.soft }}>
      <Icon name={icon} size={18} color={t.primary} />
    </Press>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 5,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: t.cardBorder,
        backgroundColor: t.card,
      }}>
      {arrow(-1, 'chevron-back', 'Mês anterior')}
      <Press
        disabled={isCurrent}
        accessibilityRole="button"
        accessibilityLabel={isCurrent ? monthLabel(month) : `${monthLabel(month)}. Tocar volta para o mês atual`}
        onPress={() => {
          tap();
          onChange(currentMonthKey());
        }}
        style={{ flex: 1 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 38 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar-clear-outline" size={14} color={t.muted} />
            <Txt variant="h2" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{monthLabel(month)}</Txt>
          </View>
          {isCurrent ? null : <Txt variant="small" color={t.primary} style={{ fontSize: 10.5, lineHeight: 14, fontWeight: '700' }}>toca pra voltar pra hoje</Txt>}
        </View>
      </Press>
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
            ...font('500'),
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
        <Text style={{ color: t.muted, fontSize: big ? 22 : 16, ...font('700'), marginRight: 6 }}>R$</Text>
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
            ...font(big ? '800' : '600'),
            letterSpacing: big ? -0.8 : 0,
            paddingVertical: 13,
          }}
        />
      </View>
      {hint ? <Txt variant="small">{hint}</Txt> : null}
    </View>
  );
}

/**
 * Rótulo pequeno, título e linha de apoio, com o espaço certo entre eles.
 * Existe para ninguém precisar de margem negativa: com fonte grande do
 * sistema, margem negativa faz as linhas se tocarem.
 */
export function CardTitle({ label, title, hint, right }: { label: string; title: string; hint?: string; right?: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">{label}</Txt>
          <Txt variant="h2">{title}</Txt>
        </View>
        {right}
      </View>
      {/* A explicação usa a largura toda: ao lado do selo ela ficava espremida. */}
      {hint ? <Txt variant="small">{hint}</Txt> : null}
    </View>
  );
}

/**
 * Espaço que o conteúdo precisa deixar no topo.
 *
 * Nas abas não existe cabeçalho do sistema: o título é desenhado pela própria
 * tela (ver `ScreenHeader`), então a folga é só a da barra de status. Nas
 * telas empilhadas o cabeçalho é transparente e fica *por cima* do conteúdo;
 * ali a altura vem do próprio navegador.
 */
export function useHeaderPad(extra = space.md): number {
  const headerHeight = useContext(HeaderHeightContext);
  const insets = useSafeAreaInsets();
  return (headerHeight && headerHeight > 0 ? headerHeight : insets.top) + extra;
}

/**
 * Faixa que cobre a barra de status. Sem ela, o conteúdo que rola por baixo
 * se mistura com o relógio e a bateria. Só existe onde não há cabeçalho.
 */
export function StatusScrim() {
  const t = useTheme();
  const headerHeight = useContext(HeaderHeightContext);
  const insets = useSafeAreaInsets();
  if ((headerHeight && headerHeight > 0) || insets.top === 0) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
      <View style={{ height: insets.top, backgroundColor: t.scrim }} />
      <LinearGradient colors={[t.scrim, 'transparent']} style={{ height: 14 }} />
    </View>
  );
}

/**
 * Título grande da tela, no lugar do cabeçalho do sistema: uma linha miúda de
 * contexto em cima, o nome da tela embaixo e, à direita, as ações.
 */
export function ScreenHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 2 }}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Txt variant="muted" numberOfLines={1} style={{ fontWeight: '600' }}>{eyebrow}</Txt> : null}
        <Txt variant="display" numberOfLines={1}>{title}</Txt>
      </View>
      {right ? <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/** Botão redondo só com ícone (ações do cabeçalho). */
export function IconButton({ icon, label, onPress, filled }: { icon: string; label: string; onPress: () => void; filled?: boolean }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? t.primary : t.card,
        borderWidth: 1,
        borderColor: filled ? t.primary : t.cardBorder,
      }}>
      <Icon name={icon} size={20} color={filled ? t.primaryText : t.text} />
    </Press>
  );
}

/**
 * Variação contra um período anterior: seta, percentual e cor.
 * `goodWhenDown` inverte o sentido (gasto caindo é bom, saldo caindo é ruim).
 */
export function DeltaChip({ pct, goodWhenDown, onHero }: { pct: number; goodWhenDown?: boolean; onHero?: boolean }) {
  const t = useTheme();
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? true : goodWhenDown ? !up : up;
  const color = onHero ? t.heroText : flat ? t.muted : good ? t.ok : t.over;
  const text = `${Math.abs(pct) >= 999 ? '999+' : Math.abs(pct).toFixed(0)}%`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: onHero ? 'rgba(255,255,255,0.18)' : flat ? t.soft : `${color}26`,
      }}>
      <Icon name={flat ? 'remove' : up ? 'arrow-up' : 'arrow-down'} size={11} color={color} />
      <Txt color={color} style={{ fontSize: 11.5, lineHeight: 16, fontWeight: '800' }}>{text}</Txt>
    </View>
  );
}

export function Screen({ children, padBottom = 150 }: { children: ReactNode; padBottom?: number }) {
  const hasBackdrop = useHasBackdrop();
  const padTop = useHeaderPad();
  return (
    <View style={{ flex: 1 }}>
      {hasBackdrop ? null : <Backdrop />}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingTop: padTop, paddingBottom: padBottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <StatusScrim />
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

/**
 * Tamanho de fonte que faz o valor caber numa caixa estreita.
 * `adjustsFontSizeToFit` só funciona no iOS, então a conta é feita aqui, pelo
 * comprimento do texto — assim o número não vira "40.200,…" no Android e na web.
 */
export function fitFontSize(text: string, max = 15, min = 10): number {
  const over = text.length - 6;
  return over <= 0 ? max : Math.max(min, max - over * 1.15);
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
