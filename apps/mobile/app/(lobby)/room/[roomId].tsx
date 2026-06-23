import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemberRow } from '../../../src/components/lobby/MemberRow';
import { RoomCodeBadge } from '../../../src/components/lobby/RoomCodeBadge';
import { Button } from '../../../src/components/ui/Button';
import { tokens } from '../../../src/design/tokens';
import { textStyle } from '../../../src/design/typography';
import { t } from '../../../src/i18n';
import { navigateHome } from '../../../src/navigation/navigateHome';
import { lobbyMemberName } from '../../../src/store/displayName';
import { saveCachedName } from '../../../src/store/nameCache';
import { usePabloClient } from '../../../src/supabase/ClientProvider';
import type { ClientErrorCode, DisplayNameMap, Room, RoomId } from '../../../src/supabase/types';

const NAME_MAX_LENGTH = 20;

export default function RoomLobbyScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const client = usePabloClient();
  const [room, setRoom] = useState<Room | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [names, setNames] = useState<DisplayNameMap>({});
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientErrorCode | null>(null);

  useEffect(() => {
    let active = true;
    void client.signIn().then((result) => {
      if (active && result.ok) setSelfId(result.data);
    });
    const unsub = client.subscribeRoom(roomId as RoomId, (next) => {
      if (active) setRoom(next);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [client, roomId]);

  // Resolve (and live-track) member display names. Re-subscribes when the
  // member list changes so newcomers get names too.
  const memberKey = room?.members.join(',') ?? '';
  useEffect(() => {
    if (!memberKey) return;
    const unsub = client.subscribeDisplayNames(memberKey.split(','), (next) => {
      setNames(next);
    });
    return unsub;
  }, [client, memberKey]);

  useEffect(() => {
    if (!room?.currentGameId) return;
    router.replace(`/(game)/${room.currentGameId}?mode=online&roomId=${room.id}`);
  }, [room?.currentGameId, room?.id]);

  const isHost = selfId !== null && room?.hostId === selfId;
  const canStart = isHost && room?.status === 'waiting' && (room?.members.length ?? 0) >= 2;

  function openNameEditor() {
    if (!selfId) return;
    const current = names[selfId]?.trim() ?? '';
    setDraftName(current);
    setEditing(true);
  }

  async function handleSaveName() {
    const trimmed = draftName.trim();
    setEditing(false);
    await client.setDisplayName(trimmed);
    await saveCachedName(trimmed);
    if (selfId) setNames((prev) => ({ ...prev, [selfId]: trimmed.length > 0 ? trimmed : null }));
  }

  async function handleStart() {
    if (!room) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.startGame({ roomId: room.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(`/(game)/${result.data}?mode=online&roomId=${room.id}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLeave() {
    if (!room) return;
    await client.leaveRoom({ roomId: room.id });
    navigateHome();
  }

  if (!room) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={tokens.color.accent.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <RoomCodeBadge code={room.code} />

      <Text style={styles.membersTitle}>{t('lobby.room.members')}</Text>
      <View style={styles.memberList}>
        {room.members.map((memberId) => (
          <MemberRow
            key={memberId}
            memberId={memberId}
            name={lobbyMemberName(memberId, { selfId, names })}
            isHost={memberId === room.hostId}
            isSelf={memberId === selfId}
            onEdit={memberId === selfId ? openNameEditor : undefined}
          />
        ))}
      </View>

      {editing && (
        <View style={styles.editor}>
          <TextInput
            style={styles.editorInput}
            value={draftName}
            onChangeText={setDraftName}
            placeholder={t('lobby.name.placeholder')}
            placeholderTextColor={tokens.color.text.secondary}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            maxLength={NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void handleSaveName()}
          />
          <View style={styles.editorActions}>
            <TouchableOpacity onPress={() => setEditing(false)} activeOpacity={0.7}>
              <Text style={styles.editorCancel}>{t('lobby.room.cancelName')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void handleSaveName()} activeOpacity={0.7}>
              <Text style={styles.editorSave}>{t('lobby.room.saveName')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.capacity}>
        {t('lobby.room.capacity', { count: room.members.length, max: room.maxPlayers })}
      </Text>

      {error && <Text style={styles.error}>{t(`error.${error}`)}</Text>}

      <View style={styles.actions}>
        {isHost && room.status === 'waiting' && (
          <Button
            label={t('lobby.room.start')}
            onPress={() => void handleStart()}
            disabled={!canStart}
            loading={loading}
          />
        )}

        {room.status === 'playing' && !room.currentGameId && (
          <Text style={styles.waiting}>{t('lobby.room.gameStarting')}</Text>
        )}

        <Button
          label={t('lobby.room.leave')}
          variant="secondary"
          onPress={() => void handleLeave()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.app,
    paddingHorizontal: tokens.space.xl,
    paddingTop: tokens.space.lg,
  },
  membersTitle: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.secondary,
    marginTop: tokens.space.lg,
  },
  memberList: {
    marginTop: tokens.space.sm,
  },
  editor: {
    marginTop: tokens.space.md,
    padding: tokens.space.md,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    gap: tokens.space.sm,
  },
  editorInput: {
    ...textStyle('md'),
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    color: tokens.color.text.primary,
  },
  editorActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tokens.space.lg,
  },
  editorCancel: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.text.secondary,
  },
  editorSave: {
    ...textStyle('sm', 'semibold'),
    color: tokens.color.accent.primary,
  },
  capacity: {
    ...textStyle('sm'),
    color: tokens.color.text.secondary,
    marginTop: tokens.space.md,
    textAlign: 'center',
  },
  actions: {
    marginTop: 'auto',
    paddingBottom: tokens.space.xl,
    gap: tokens.space.md,
  },
  waiting: {
    ...textStyle('sm'),
    textAlign: 'center',
    color: tokens.color.text.secondary,
  },
  error: {
    ...textStyle('sm'),
    color: tokens.game.accent.pabloOnTurn,
    textAlign: 'center',
  },
});
