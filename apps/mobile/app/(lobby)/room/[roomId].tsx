import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemberRow } from '../../../src/components/lobby/MemberRow';
import { RoomCodeBadge } from '../../../src/components/lobby/RoomCodeBadge';
import { tokens } from '../../../src/design/tokens';
import { t } from '../../../src/i18n';
import { usePabloClient } from '../../../src/supabase/ClientProvider';
import type { ClientErrorCode, Room, RoomId } from '../../../src/supabase/types';

export default function RoomLobbyScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const client = usePabloClient();
  const [room, setRoom] = useState<Room | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!room?.currentGameId) return;
    router.replace(`/(game)/${room.currentGameId}?mode=online&roomId=${room.id}`);
  }, [room?.currentGameId, room?.id]);

  const isHost = selfId !== null && room?.hostId === selfId;
  const canStart = isHost && room?.status === 'waiting' && (room?.members.length ?? 0) >= 2;

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
    router.replace('/(home)');
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
            isHost={memberId === room.hostId}
            isSelf={memberId === selfId}
          />
        ))}
      </View>

      <Text style={styles.capacity}>
        {t('lobby.room.capacity', { count: room.members.length, max: room.maxPlayers })}
      </Text>

      {error && <Text style={styles.error}>{t(`error.${error}`)}</Text>}

      <View style={styles.actions}>
        {isHost && room.status === 'waiting' && (
          <TouchableOpacity
            style={[styles.primaryBtn, !canStart && styles.primaryBtnDisabled]}
            onPress={() => void handleStart()}
            disabled={!canStart || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={tokens.color.text.inverse} />
            ) : (
              <Text style={styles.primaryBtnText}>{t('lobby.room.start')}</Text>
            )}
          </TouchableOpacity>
        )}

        {room.status === 'playing' && !room.currentGameId && (
          <Text style={styles.waiting}>{t('lobby.room.gameStarting')}</Text>
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => void handleLeave()}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>{t('lobby.room.leave')}</Text>
        </TouchableOpacity>
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
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.semibold,
    color: tokens.color.text.secondary,
    marginTop: tokens.space.lg,
  },
  memberList: {
    marginTop: tokens.space.sm,
  },
  capacity: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text.secondary,
    marginTop: tokens.space.md,
    textAlign: 'center',
  },
  actions: {
    marginTop: 'auto',
    paddingBottom: tokens.space.xl,
    gap: tokens.space.md,
  },
  primaryBtn: {
    backgroundColor: tokens.color.accent.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: tokens.color.text.inverse,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semibold,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.space.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: tokens.color.text.primary,
    fontSize: tokens.font.size.md,
  },
  waiting: {
    textAlign: 'center',
    color: tokens.color.text.secondary,
    fontSize: tokens.font.size.sm,
  },
  error: {
    color: tokens.game.accent.pabloOnTurn,
    textAlign: 'center',
    fontSize: tokens.font.size.sm,
  },
});
