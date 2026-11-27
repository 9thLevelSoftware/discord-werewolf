import type { W20RollResult, SheetShortcut, RuleContext, SpecialtyMode } from '@w20-vtt/core';
import { MAX_PHYSICAL_BONUS_WAVES, MAX_PHYSICAL_DICE_PER_WAVE } from '@w20-vtt/protocol';
import type { Queued3DRoll } from '../../store/useVttRoomStore';

/**
 * How long a throw may take to come to rest before we give up on it, wipe the dice and
 * let the server roll instead. Dice normally rest in 2-4 seconds, and take longer when
 * the frame rate is low, so a tight limit here discards throws the player watched land.
 */
export const PHYSICS_SETTLE_TIMEOUT_MS = 7000;
/**
 * dice-box freezes any die still moving after this long and reports whichever face is
 * up, even if the die is in mid-air. Passed as `settleTimeout`, and kept above
 * PHYSICS_SETTLE_TIMEOUT_MS so those forced readings are never sent to the server.
 */
export const DICE_FORCE_FREEZE_MS = 12000;
export const ECHO_WAIT_TIMEOUT_MS = 2500;
export const HOLD_SINGLE_NEXT_MS = 1600;
export const HOLD_BURST_NEXT_MS = 1050;
export const MAX_LOCAL_QUEUED_ROLLS = 10;

export interface DiceBoxGroup {
  qty: number;
  sides: number;
  themeColor: string;
}

export interface DiceBoxRollOptions {
  theme?: string;
  themeColor?: string;
  newStartPoint?: boolean;
  seed?: string;
}

export interface DiceBoxLike {
  roll: (groups: DiceBoxGroup[], opts?: DiceBoxRollOptions) => Promise<unknown>;
  add?: (groups: DiceBoxGroup[], opts?: DiceBoxRollOptions) => Promise<unknown>;
  clear: () => unknown;
}

export interface LocalQueuedRollSpec {
  shortcut?: SheetShortcut;
  ruleContext?: RuleContext;
  sheetId?: string;
  initiativeAdjustment?: number;
  willpowerSource?: 'pack';
  rollClientId: string;
  pool: number;
  rageDiceCount: number;
  difficulty: number;
  hasSpecialty: boolean;
  specialtyMode?: SpecialtyMode;
  spendWillpower: boolean;
  applyWoundPenalty: boolean;
  rollMode: 'pool' | 'initiative';
  initiativeModifier?: number;
  label: string;
  isSecretRoll: boolean;
  seatId: string;
  rollerDisplayName: string;
  effectivePool: number;
  effectiveRage: number;
}

export interface RollStageStatus {
  isRolling: boolean;
  activeThrowLabel: string | null;
  queuedCount: number;
  nextQueuedLabel: string | null;
  localPendingCount: number;
}

export interface RollStageTimingOptions {
  echoWaitTimeoutMs?: number;
  holdSingleNextMs?: number;
  holdBurstNextMs?: number;
  now?: () => number;
}

export interface RollStageCoordinatorOptions {
  diceBox: SafeDiceBoxController;
  getRemoteQueue: () => Queued3DRoll[];
  dequeueRemoteRoll: (id: string) => void;
  consumeRemoteRollByClientId: (rollClientId: string) => Queued3DRoll | null;
  onSendRollCommand: (
    spec: LocalQueuedRollSpec,
    physicalDiceValues: number[] | undefined,
    physicalBonusWaves?: number[][]
  ) => void;
  onSetBanner: (banner: Queued3DRoll | null) => void;
  onSetHasDiceOnTable: (hasDice: boolean) => void;
  onPlayThrowSound: (effectivePool: number, rageCount: number) => void;
  onStopThrowSound: () => void;
  onPlayOutcomeSound: (roll: W20RollResult) => void;
  onStatusChange: (status: RollStageStatus) => void;
  /**
   * A local roll was sent but never confirmed by the table: either the server
   * rejected it, or no confirmation arrived in time.
   */
  onLocalRollUnconfirmed?: (spec: LocalQueuedRollSpec, reason: 'rejected' | 'timeout') => void;
  timing?: RollStageTimingOptions;
}

/**
 * Extracts normalized 1..10 die face values settled by @3d-dice/dice-box.
 * Returns undefined if counts do not match the expected effective pool.
 */
export function extractSettledDiceValues(
  raw: unknown,
  expectedCount: number
): number[] | undefined {
  if (!Array.isArray(raw) || expectedCount <= 0 || raw.length !== expectedCount) {
    return undefined;
  }
  const values: number[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !('value' in item)) {
      return undefined;
    }
    const rawVal: unknown = item.value;
    if (typeof rawVal !== 'number' || !Number.isInteger(rawVal) || rawVal < 0 || rawVal > 10) {
      return undefined;
    }
    values.push(rawVal === 0 ? 10 : rawVal);
  }
  return values;
}

/**
 * True when the faces left on the felt are exactly the dice the server recorded.
 */
export function physicalDiceMatchRoll(
  physicalDiceValues: number[] | undefined,
  roll: W20RollResult,
  physicalBonusWaves: number[][] = []
): boolean {
  if (!physicalDiceValues) return false;
  const values = [...physicalDiceValues, ...physicalBonusWaves.flat()];
  return (
    roll.dice.length === values.length &&
    roll.dice.every(
      (die, idx) =>
        die.value === values[idx] && die.isBonusExplosionDie === (idx >= physicalDiceValues.length)
    )
  );
}

/**
 * Derives the throw size of each recorded bonus wave. Legacy records wrote each
 * explosion chain in order immediately after its original die.
 */
export function getRecordedBonusWaveSizes(roll: W20RollResult): number[] {
  const waveByIndex: number[] = [];
  const counts: number[] = [];
  for (const [index, die] of roll.dice.entries()) {
    const parent = die.parentIndex ?? index - 1;
    const wave = die.isBonusExplosionDie ? (waveByIndex[parent] ?? 0) + 1 : 0;
    waveByIndex.push(wave);
    if (wave > 0) counts[wave - 1] = (counts[wave - 1] ?? 0) + 1;
  }
  return counts;
}

/** Colours handed to the 3D dice renderer. Rage dice are identified by their colour. */
export const DICE_THEME_COLORS = {
  normal: '#18181b',
  rage: '#991b1b',
} as const;

/** True when a settled die reported by the 3D renderer is a Rage die. */
export function isRageDieThemeColor(themeColor: unknown): boolean {
  return themeColor === DICE_THEME_COLORS.rage;
}

/**
 * Partitions an effective dice pool into Obsidian base dice and crimson Rage dice groups.
 */
export function buildDiceBoxGroups(
  effectivePool: number,
  rageDiceCount: number
): DiceBoxGroup[] {
  if (effectivePool <= 0) return [];
  const clampedRage = Math.min(effectivePool, Math.max(0, rageDiceCount));
  const obsidianCount = effectivePool - clampedRage;
  const groups: DiceBoxGroup[] = [];
  if (obsidianCount > 0) {
    groups.push({ qty: obsidianCount, sides: 10, themeColor: DICE_THEME_COLORS.normal });
  }
  if (clampedRage > 0) {
    groups.push({ qty: clampedRage, sides: 10, themeColor: DICE_THEME_COLORS.rage });
  }
  return groups;
}

/**
 * Wraps @3d-dice/dice-box so interrupted or stalled throws never leave unresolved Promises.
 * In dice-box, calling clear() or starting another roll() wipes rollCollectionData without
 * settling prior promises; this controller guarantees every throwDice() settles cleanly.
 */
export class SafeDiceBoxController {
  private box: DiceBoxLike | null = null;
  private ready = false;
  private cancelActiveThrow: (() => void) | null = null;
  private readonly isDocumentHidden: () => boolean;

  constructor(deps?: { isDocumentHidden?: () => boolean }) {
    this.isDocumentHidden =
      deps?.isDocumentHidden ??
      (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  }

  setBox(box: DiceBoxLike | null, ready: boolean): void {
    if (this.box && (this.box !== box || !ready)) {
      this.interruptCurrentThrow();
    }
    this.box = box;
    this.ready = Boolean(ready && box);
  }

  isReady(): boolean {
    return this.ready && this.box !== null;
  }

  clearBoxSafely(): void {
    if (!this.box) return;
    try {
      this.box.clear();
    } catch {
      // Ignore WebGL/canvas teardown errors
    }
  }

  interruptCurrentThrow(): void {
    this.clearBoxSafely();
    const cancel = this.cancelActiveThrow;
    this.cancelActiveThrow = null;
    cancel?.();
  }

  async throwDice(
    groups: DiceBoxGroup[],
    opts?: { timeoutMs?: number; rollOptions?: DiceBoxRollOptions; append?: boolean }
  ): Promise<{ settled: unknown; interrupted: boolean }> {
    if (this.cancelActiveThrow) {
      this.interruptCurrentThrow();
    }

    if (!this.ready || !this.box) {
      return { settled: undefined, interrupted: true };
    }

    if (groups.length === 0) {
      this.clearBoxSafely();
      return { settled: undefined, interrupted: false };
    }

    if (this.isDocumentHidden()) {
      this.clearBoxSafely();
      return { settled: undefined, interrupted: true };
    }

    const activeBox = this.box;
    const throwCollection = opts?.append ? activeBox.add : activeBox.roll;
    if (!throwCollection) {
      this.clearBoxSafely();
      return { settled: undefined, interrupted: true };
    }
    const timeoutMs = opts?.timeoutMs ?? PHYSICS_SETTLE_TIMEOUT_MS;
    const rollOptions: DiceBoxRollOptions = opts?.rollOptions ?? {
      theme: 'default',
      newStartPoint: true,
    };

    return new Promise<{ settled: unknown; interrupted: boolean }>((resolve) => {
      let settledOnce = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let visHandler: (() => void) | null = null;

      const finish = (settled: unknown, interrupted: boolean) => {
        if (settledOnce) return;
        settledOnce = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (visHandler && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', visHandler);
          visHandler = null;
        }
        if (this.cancelActiveThrow === abortSilently) {
          this.cancelActiveThrow = null;
        }
        resolve({ settled, interrupted });
      };

      const abortSilently = () => {
        finish(undefined, true);
      };

      this.cancelActiveThrow = abortSilently;

      timeoutId = setTimeout(() => {
        this.clearBoxSafely();
        finish(undefined, true);
      }, timeoutMs);

      if (typeof document !== 'undefined') {
        visHandler = () => {
          if (this.isDocumentHidden()) {
            this.clearBoxSafely();
            finish(undefined, true);
          }
        };
        document.addEventListener('visibilitychange', visHandler);
      }

      try {
        throwCollection.call(activeBox, groups, rollOptions).then(
          (result) => finish(result, false),
          () => {
            if (settledOnce) return;
            this.clearBoxSafely();
            finish(undefined, true);
          }
        );
      } catch {
        this.clearBoxSafely();
        finish(undefined, true);
      }
    });
  }
}

/** Replays recorded throw sizes with fresh physics, keeping earlier dice on the felt until reveal. */
export async function playRecordedDiceThrow(
  diceBox: SafeDiceBoxController,
  roll: W20RollResult,
  rageCount: number,
  isCanceled: () => boolean,
  onThrow?: (count: number, rage: number) => void
): Promise<void> {
  const waveSizes = [roll.effectivePool, ...getRecordedBonusWaveSizes(roll)];
  for (const [index, count] of waveSizes.entries()) {
    if (isCanceled() || !diceBox.isReady() || count <= 0) break;
    const rage = index === 0 ? rageCount : 0;
    onThrow?.(count, rage);
    const { interrupted } = await diceBox.throwDice(buildDiceBoxGroups(count, rage), {
      append: index > 0,
      rollOptions: { seed: roll.physicsSeed },
    });
    if (interrupted) break;
  }
}

/**
 * Single-flight 3D dice stage coordinator that serializes local and remote rolls,
 * prevents Concurrent DiceBox overwrites/orphaned Promises, guarantees zero roll loss,
 * and paces result plaques so rapid multi-player bursts remain readable.
 */
export class RollStageCoordinator {
  private readonly diceBox: SafeDiceBoxController;
  private readonly options: RollStageCoordinatorOptions;
  private readonly echoWaitTimeoutMs: number;
  private readonly holdSingleNextMs: number;
  private readonly holdBurstNextMs: number;
  private readonly now: () => number;

  private readonly localQueue: LocalQueuedRollSpec[] = [];
  private readonly expectedLocalClientIds = new Set<string>();
  private readonly earlyMatchedEchoes = new Map<string, Queued3DRoll>();
  /** Our own rolls whose confirmation did not arrive in time; it may still turn up later. */
  private readonly lateLocalClientIds = new Set<string>();
  private readonly echoWaiters = new Map<string, (roll: Queued3DRoll | null) => void>();
  private inFlightRejected = false;

  private inFlightLocalSpec: LocalQueuedRollSpec | null = null;
  private inFlightLocalSent = false;
  private activeRemoteId: string | null = null;
  private activeThrowLabel: string | null = null;
  private isRolling = false;
  private feltClearedForActiveThrow = false;
  private bannerShownAtMs = 0;

  private pumping = false;
  private pumpAgain = false;
  private disposed = false;

  private holdTimerId: ReturnType<typeof setTimeout> | null = null;
  private holdWakeResolver: (() => void) | null = null;

  constructor(options: RollStageCoordinatorOptions) {
    this.options = options;
    this.diceBox = options.diceBox;
    this.echoWaitTimeoutMs = options.timing?.echoWaitTimeoutMs ?? ECHO_WAIT_TIMEOUT_MS;
    this.holdSingleNextMs = options.timing?.holdSingleNextMs ?? HOLD_SINGLE_NEXT_MS;
    this.holdBurstNextMs = options.timing?.holdBurstNextMs ?? HOLD_BURST_NEXT_MS;
    this.now = options.timing?.now ?? (() => Date.now());
  }

  getLocalPendingCount(): number {
    return (this.inFlightLocalSpec ? 1 : 0) + this.localQueue.length;
  }

  getStatus(): RollStageStatus {
    const playableRemotes = this.getPlayableRemotes();
    const waitingLabels = [
      ...this.localQueue.map((spec) => `${spec.rollerDisplayName} • ${spec.label}`),
      ...playableRemotes.map(
        (remote) => `${remote.rollerName ?? 'Player'} • ${remote.label}`
      ),
    ];

    return {
      isRolling: this.isRolling,
      activeThrowLabel: this.activeThrowLabel,
      queuedCount: waitingLabels.length,
      nextQueuedLabel: waitingLabels[0] ?? null,
      localPendingCount: this.getLocalPendingCount(),
    };
  }

  enqueueLocalRoll(spec: LocalQueuedRollSpec): boolean {
    if (this.disposed || this.getLocalPendingCount() >= MAX_LOCAL_QUEUED_ROLLS) {
      return false;
    }

    this.expectedLocalClientIds.add(spec.rollClientId);
    this.localQueue.push(spec);
    this.emitStatus();
    this.pump();
    return true;
  }

  /**
   * The server rejected a command. If one of our rolls is waiting for confirmation,
   * treat the rejection as its answer instead of waiting out the timeout.
   */
  notifyCommandRejected(): void {
    if (this.disposed || !this.inFlightLocalSent || !this.inFlightLocalSpec) return;
    this.inFlightRejected = true;
    this.echoWaiters.get(this.inFlightLocalSpec.rollClientId)?.(null);
  }

  notifyInboundQueueChanged(): void {
    if (this.disposed) return;

    for (const clientId of Array.from(this.expectedLocalClientIds)) {
      const matched = this.options.consumeRemoteRollByClientId(clientId);
      if (!matched) continue;

      const waiter = this.echoWaiters.get(clientId);
      if (waiter) {
        this.echoWaiters.delete(clientId);
        waiter(matched);
      } else {
        this.earlyMatchedEchoes.set(clientId, matched);
      }
    }

    this.emitStatus();
    this.pump();
  }

  dismissBanner(): void {
    this.bannerShownAtMs = 0;
    this.options.onSetBanner(null);
    this.wakeHold();
    this.emitStatus();
  }

  clearFelt(): void {
    this.feltClearedForActiveThrow = true;
    this.options.onStopThrowSound();
    this.diceBox.interruptCurrentThrow();
    this.bannerShownAtMs = 0;
    this.options.onSetHasDiceOnTable(false);
    this.options.onSetBanner(null);
    this.wakeHold();
    this.emitStatus();
  }

  flushUnsentLocalRolls(): void {
    if (this.inFlightLocalSpec && !this.inFlightLocalSent) {
      this.inFlightLocalSent = true;
      this.options.onSendRollCommand(this.inFlightLocalSpec, undefined);
    }

    while (this.localQueue.length > 0) {
      const nextSpec = this.localQueue.shift()!;
      this.expectedLocalClientIds.delete(nextSpec.rollClientId);
      this.options.onSendRollCommand(nextSpec, undefined);
    }

    this.emitStatus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flushUnsentLocalRolls();
    this.options.onStopThrowSound();
    this.diceBox.interruptCurrentThrow();
    this.wakeHold();

    for (const [, waiter] of this.echoWaiters) {
      waiter(null);
    }
    this.echoWaiters.clear();
    this.earlyMatchedEchoes.clear();
    this.expectedLocalClientIds.clear();
    this.lateLocalClientIds.clear();
  }

  private emitStatus(): void {
    this.options.onStatusChange(this.getStatus());
  }

  private getPlayableRemotes(): Queued3DRoll[] {
    return this.options
      .getRemoteQueue()
      .filter(
        (item) =>
          item.id !== this.activeRemoteId &&
          !(item.rollClientId && this.expectedLocalClientIds.has(item.rollClientId))
      );
  }

  private findNextPlayableRemote(): Queued3DRoll | undefined {
    return this.getPlayableRemotes()[0];
  }

  private pump(): void {
    if (this.disposed) return;
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    void this.runPumpLoop();
  }

  private async runPumpLoop(): Promise<void> {
    this.pumping = true;
    try {
      while (!this.disposed) {
        this.pumpAgain = false;
        const hasLocal = this.localQueue.length > 0;
        const nextRemote = hasLocal ? undefined : this.findNextPlayableRemote();

        if (!hasLocal && !nextRemote) {
          break;
        }

        await this.waitRemainingBannerHoldIfNeeded();
        if (this.disposed) break;

        // Re-check local queue first after hold so player rolls get Priority 1
        const localSpec = this.localQueue.shift();
        if (localSpec) {
          await this.runLocalRoll(localSpec);
          continue;
        }

        const remoteRoll = this.findNextPlayableRemote();
        if (remoteRoll) {
          await this.runRemoteRoll(remoteRoll);
        }
      }
    } finally {
      this.pumping = false;
      if (this.pumpAgain && !this.disposed) {
        this.pumpAgain = false;
        this.pump();
      }
    }
  }

  private async waitRemainingBannerHoldIfNeeded(): Promise<void> {
    if (this.bannerShownAtMs <= 0 || this.disposed) return;

    const totalWaiting = this.localQueue.length + this.getPlayableRemotes().length;
    if (totalWaiting <= 0) return;

    const targetHoldMs = totalWaiting >= 2 ? this.holdBurstNextMs : this.holdSingleNextMs;
    const elapsedMs = this.now() - this.bannerShownAtMs;
    const remainingMs = targetHoldMs - elapsedMs;
    if (remainingMs <= 0) return;

    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        if (this.holdTimerId !== null) {
          clearTimeout(this.holdTimerId);
          this.holdTimerId = null;
        }
        if (this.holdWakeResolver === done) {
          this.holdWakeResolver = null;
        }
        resolve();
      };

      this.holdWakeResolver = done;
      this.holdTimerId = setTimeout(done, remainingMs);
    });
  }

  private wakeHold(): void {
    if (this.holdTimerId !== null) {
      clearTimeout(this.holdTimerId);
      this.holdTimerId = null;
    }
    const wake = this.holdWakeResolver;
    this.holdWakeResolver = null;
    wake?.();
  }

  private waitForEcho(rollClientId: string, timeoutMs: number): Promise<Queued3DRoll | null> {
    const early = this.earlyMatchedEchoes.get(rollClientId);
    if (early) {
      this.earlyMatchedEchoes.delete(rollClientId);
      return Promise.resolve(early);
    }

    const immediate = this.options.consumeRemoteRollByClientId(rollClientId);
    if (immediate) {
      return Promise.resolve(immediate);
    }

    if (this.disposed) {
      return Promise.resolve(null);
    }

    return new Promise<Queued3DRoll | null>((resolve) => {
      let resolvedOnce = false;
      let timerId: ReturnType<typeof setTimeout> | null = null;

      const finish = (roll: Queued3DRoll | null) => {
        if (resolvedOnce) return;
        resolvedOnce = true;
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        if (this.echoWaiters.get(rollClientId) === finish) {
          this.echoWaiters.delete(rollClientId);
        }
        resolve(roll);
      };

      this.echoWaiters.set(rollClientId, finish);
      timerId = setTimeout(() => finish(null), timeoutMs);
    });
  }

  private async runLocalRoll(spec: LocalQueuedRollSpec): Promise<void> {
    this.inFlightLocalSpec = spec;
    this.inFlightLocalSent = false;
    this.feltClearedForActiveThrow = false;
    this.isRolling = true;
    this.activeThrowLabel = `${spec.rollerDisplayName} • ${spec.label}`;
    this.bannerShownAtMs = 0;
    this.options.onSetBanner(null);
    this.emitStatus();

    const physicalDiceValues = await this.throwLocalWave(spec.effectivePool, spec.effectiveRage, false);
    const physicalBonusWaves: number[][] = [];
    let hasDice = Boolean(physicalDiceValues);
    if (
      physicalDiceValues &&
      spec.rollMode === 'pool' &&
      spec.hasSpecialty &&
      spec.specialtyMode === 'revised_explode'
    ) {
      let previousWave = physicalDiceValues;
      while (
        !this.disposed &&
        !this.inFlightLocalSent &&
        !this.feltClearedForActiveThrow &&
        physicalBonusWaves.length < MAX_PHYSICAL_BONUS_WAVES
      ) {
        const waveSize = previousWave.filter((face) => face === 10).length;
        if (waveSize === 0) break;
        const faces = await this.throwLocalWave(waveSize, 0, true);
        if (!faces) {
          hasDice = false;
          break;
        }
        physicalBonusWaves.push(faces);
        previousWave = faces;
      }
    }

    if (!this.disposed && !this.feltClearedForActiveThrow) {
      this.options.onSetHasDiceOnTable(hasDice);
    }

    // Register echo waiter BEFORE invoking onSendRollCommand so synchronous echoes are captured
    const echoPromise = this.waitForEcho(spec.rollClientId, this.echoWaitTimeoutMs);
    if (!this.inFlightLocalSent) {
      this.inFlightLocalSent = true;
      if (physicalBonusWaves.length > 0) {
        this.options.onSendRollCommand(spec, physicalDiceValues, physicalBonusWaves);
      } else {
        this.options.onSendRollCommand(spec, physicalDiceValues);
      }
    }
    this.notifyInboundQueueChanged();

    const echoedRoll = await echoPromise;
    this.expectedLocalClientIds.delete(spec.rollClientId);

    if (!echoedRoll && !this.disposed) {
      if (!this.inFlightRejected) {
        this.lateLocalClientIds.add(spec.rollClientId);
      }
      this.options.onLocalRollUnconfirmed?.(spec, this.inFlightRejected ? 'rejected' : 'timeout');
    }

    // Only confirmed faces can remain on the felt.
    if (
      hasDice &&
      !this.disposed &&
      !this.feltClearedForActiveThrow &&
      (!echoedRoll || !physicalDiceMatchRoll(physicalDiceValues, echoedRoll.roll, physicalBonusWaves))
    ) {
      this.diceBox.clearBoxSafely();
      this.options.onSetHasDiceOnTable(false);
    }
    this.inFlightRejected = false;

    this.inFlightLocalSpec = null;
    this.inFlightLocalSent = false;
    this.isRolling = false;
    this.activeThrowLabel = null;

    if (echoedRoll && !this.disposed && !this.feltClearedForActiveThrow) {
      this.bannerShownAtMs = this.now();
      this.options.onSetBanner(echoedRoll);
      this.options.onPlayOutcomeSound(echoedRoll.roll);
    }

    this.emitStatus();
  }

  private async throwLocalWave(count: number, rageCount: number, append: boolean) {
    if (count > MAX_PHYSICAL_DICE_PER_WAVE) {
      this.diceBox.clearBoxSafely();
      return undefined;
    }
    if (count > 0) this.options.onPlayThrowSound(count, rageCount);
    const { settled, interrupted } = await this.diceBox.throwDice(
      buildDiceBoxGroups(count, rageCount),
      { append }
    );
    this.options.onStopThrowSound();
    if (interrupted || this.disposed || this.feltClearedForActiveThrow) return undefined;
    const faces = extractSettledDiceValues(settled, count);
    if (!faces && count > 0) this.diceBox.clearBoxSafely();
    return faces;
  }

  private async runRemoteRoll(remote: Queued3DRoll): Promise<void> {
    this.activeRemoteId = remote.id;
    this.feltClearedForActiveThrow = false;
    this.isRolling = true;
    this.activeThrowLabel = `${remote.rollerName ?? 'Player'} • ${remote.label}`;
    this.bannerShownAtMs = 0;
    this.options.onSetBanner(null);
    this.emitStatus();

    try {
      const rageCount = remote.rageDiceCount ?? 0;
      // A late confirmation of our own roll was already thrown once. Throwing it again
      // would land on different faces, so show the recorded result on its own.
      const isLateOwnRoll =
        remote.rollClientId !== undefined && this.lateLocalClientIds.delete(remote.rollClientId);
      if (!isLateOwnRoll) {
        await playRecordedDiceThrow(
          this.diceBox,
          remote.roll,
          rageCount,
          () => this.disposed || this.feltClearedForActiveThrow,
          this.options.onPlayThrowSound
        );
      }
      this.options.onStopThrowSound();

      if (!this.disposed && !this.feltClearedForActiveThrow) {
        // The replay is only an animation: its dice land on random faces, not the
        // recorded ones. Take them away as the recorded result appears.
        this.diceBox.clearBoxSafely();
        this.options.onSetHasDiceOnTable(false);
        this.bannerShownAtMs = this.now();
        this.options.onSetBanner(remote);
        this.options.onPlayOutcomeSound(remote.roll);
      }
    } finally {
      this.activeRemoteId = null;
      this.isRolling = false;
      this.activeThrowLabel = null;
      this.options.dequeueRemoteRoll(remote.id);
      this.emitStatus();
    }
  }
}
