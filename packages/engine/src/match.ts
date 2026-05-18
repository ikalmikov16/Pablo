import type { GameRules, MatchState, PlayerId, RoundScore } from './types';
import { DEFAULT_RULES } from './types';
import { newGame } from './newGame';

function deriveRoundSeed(matchSeed: string, roundNumber: number): string {
  return `${matchSeed}:r${roundNumber}`;
}

/**
 * Create a new match. Does not start the first round — call `startNextRound`.
 */
export function newMatch(opts: {
  readonly id: string;
  readonly players: ReadonlyArray<PlayerId>;
  readonly seed: string;
  readonly rules?: Partial<GameRules>;
}): MatchState {
  const rules: GameRules = opts.rules ? { ...DEFAULT_RULES, ...opts.rules } : DEFAULT_RULES;
  const cumulativeScores: Record<PlayerId, number> = {};
  for (const p of opts.players) {
    cumulativeScores[p] = 0;
  }
  return {
    id: opts.id,
    players: opts.players,
    rules,
    seed: opts.seed,
    currentRound: null,
    cumulativeScores,
    roundHistory: [],
    status: 'between_rounds',
    winner: null,
  };
}

/**
 * Start a new round inside an existing match.
 * The match must be in status 'between_rounds'.
 */
export function startNextRound(match: MatchState): MatchState {
  if (match.status === 'ended') {
    throw new Error('startNextRound: match has already ended');
  }
  const roundNumber = match.roundHistory.length + 1;
  const roundSeed = deriveRoundSeed(match.seed, roundNumber);
  const currentRound = newGame({
    id: `${match.id}:r${roundNumber}`,
    players: match.players,
    seed: roundSeed,
    rules: match.rules,
    roundNumber,
  });
  return {
    ...match,
    status: 'in_progress',
    currentRound,
  };
}

/**
 * Finalise the current round: write it to history, update cumulative scores,
 * and decide if the match is over.
 *
 * The match ends when at least one player's cumulative score reaches
 * `rules.maxScore`. The winner is the player with the LOWEST cumulative score.
 */
export function endRound(match: MatchState, roundScore: RoundScore): MatchState {
  const newCumulative: Record<PlayerId, number> = {};
  for (const p of match.players) {
    newCumulative[p] = (match.cumulativeScores[p] ?? 0) + (roundScore.perPlayerRound[p] ?? 0);
  }

  const roundHistory = [...match.roundHistory, roundScore];

  const matchOver = match.players.some((p) => newCumulative[p]! >= match.rules.maxScore);

  if (matchOver) {
    let lowestScore = Infinity;
    for (const p of match.players) {
      if (newCumulative[p]! < lowestScore) lowestScore = newCumulative[p]!;
    }
    const winner = match.players.find((p) => newCumulative[p] === lowestScore) ?? match.players[0]!;
    return {
      ...match,
      cumulativeScores: newCumulative,
      roundHistory,
      currentRound: null,
      status: 'ended',
      winner,
    };
  }

  return {
    ...match,
    cumulativeScores: newCumulative,
    roundHistory,
    currentRound: null,
    status: 'between_rounds',
  };
}
