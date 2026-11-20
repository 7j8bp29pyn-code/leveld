import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays } from '../domain/dates';
import { openTodos, TODO_SUGGESTIONS } from '../domain/todos';
import type { Todo } from '../domain/types';
import { useStore } from '../state/AppStore';
import { Button, Chip, Field, Muted } from './components';
import { confirm } from './confirm';
import { formatDate, relativeDay } from './format';
import { colors, font, radius, space } from './theme';

export function TodoRow({ todo, overdue, prefix = 'todo' }: { todo: Todo; overdue?: boolean; prefix?: string }) {
  const { t } = useTranslation();
  const store = useStore();
  const done = !!todo.doneAt;
  const sub = todo.dueDate ? (overdue ? t('todos.since', { date: formatDate(todo.dueDate) }) : relativeDay(todo.dueDate, store.today)) : '';
  return (
    <View testID={`${prefix}-${todo.title}`} style={{
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: space.sm,
      padding: space.md, borderWidth: 1, borderColor: colors.border, opacity: done ? 0.6 : 1,
    }}>
      <Pressable testID={`${prefix}-check-${todo.title}`} accessibilityRole="checkbox" accessibilityState={{ checked: done }} aria-checked={done}
        accessibilityLabel={t('todos.checkA11y', { name: todo.title })} hitSlop={8} onPress={() => store.toggleTodo(todo.id)}
        style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: done ? colors.success : colors.textFaint,
          backgroundColor: done ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: space.md }}>
        {done && <Ionicons name="checkmark" size={18} color={colors.onAccent} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[font.body, done && { textDecorationLine: 'line-through', color: colors.textMuted }]}>{todo.title}</Text>
        {sub ? <Muted>{sub}</Muted> : null}
      </View>
      <Pressable accessibilityLabel={t('common.delete')} hitSlop={8}
        onPress={async () => { if (await confirm(t('todos.deleteConfirm', { name: todo.title }))) await store.deleteTodo(todo.id); }}>
        <Ionicons name="close" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

/** Add a to-do (optional due day) + one-tap suggestions. */
export function AddTodo() {
  const { t } = useTranslation();
  const store = useStore();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const openTitles = new Set(openTodos(store.data.todos).map((x) => x.title));
  const add = async (text: string, dueDate: string | null) => {
    if (!text.trim()) return;
    if (await store.saveTodo({ title: text, dueDate, note: '' })) { setTitle(''); setDue(null); }
  };
  const dues: { label: string; value: string | null }[] = [
    { label: t('todos.noDue'), value: null }, { label: t('todos.dueToday'), value: store.today }, { label: t('todos.dueTomorrow'), value: addDays(store.today, 1) },
  ];
  const suggestions = TODO_SUGGESTIONS.map((k) => t(`todos.ideas.${k}`)).filter((s) => !openTitles.has(s));
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field testID="todo-input" value={title} onChangeText={setTitle} placeholder={t('todos.placeholder')} maxLength={200}
            onSubmitEditing={() => add(title, due)} />
        </View>
        <Button testID="todo-add" kind="secondary" icon="add" title={t('common.add')} disabled={!title.trim()} onPress={() => add(title, due)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {dues.map((d, i) => <Chip key={d.label} testID={`todo-due-${i}`} label={d.label} selected={due === d.value} onPress={() => setDue(d.value)} />)}
      </View>
      {suggestions.length > 0 && (
        <>
          <Text style={[font.label, { marginTop: space.sm, marginBottom: 6 }]}>{t('todos.suggestions')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {suggestions.slice(0, 6).map((s) => <Chip key={s} testID={`todo-idea-${s}`} label={`+ ${s}`} onPress={() => add(s, null)} />)}
          </View>
        </>
      )}
    </View>
  );
}

/** Full list: open tasks + collapsible done ones. */
export function TodoList() {
  const { t } = useTranslation();
  const store = useStore();
  const [showDone, setShowDone] = useState(false);
  const open = openTodos(store.data.todos);
  const done = store.data.todos.filter((x) => x.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return (
    <View>
      {open.length === 0 && <Muted style={{ marginBottom: space.sm }}>{t('todos.empty')}</Muted>}
      {open.map((x) => <TodoRow key={x.id} prefix="todolist" todo={x} overdue={!!x.dueDate && x.dueDate < store.today} />)}
      {done.length > 0 && (
        <Pressable onPress={() => setShowDone(!showDone)} style={{ paddingVertical: space.sm }}>
          <Text style={{ color: colors.accent }}>{showDone ? t('todos.hideDone') : t('todos.showDone', { n: done.length })}</Text>
        </Pressable>
      )}
      {showDone && done.slice(0, 30).map((x) => <TodoRow key={x.id} prefix="todolist" todo={x} />)}
    </View>
  );
}
