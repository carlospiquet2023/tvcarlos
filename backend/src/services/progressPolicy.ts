export interface ProgressSnapshot {
    position: number;
    watchedSeconds: number;
    lastPositionAt: Date | null;
    completed: boolean;
    completedAt: Date | null;
}

export interface ProgressPolicyInput {
    requestedPosition: number;
    durationSeconds: number | null;
    previous?: ProgressSnapshot | null;
    now?: Date;
}

export interface ProgressPolicyResult {
    position: number;
    watchedSeconds: number;
    lastPositionAt: Date;
    completed: boolean;
    completedAt: Date | null;
}

export function calculateProgressUpdate(input: ProgressPolicyInput): ProgressPolicyResult {
    const now = input.now ?? new Date();
    const duration = input.durationSeconds && input.durationSeconds > 0
        ? input.durationSeconds
        : null;
    const position = Math.floor(duration
        ? Math.min(input.requestedPosition, duration)
        : input.requestedPosition);
    const previousPosition = input.previous?.position ?? 0;
    const forwardDelta = Math.max(0, position - previousPosition);
    const elapsedSeconds = input.previous?.lastPositionAt
        ? Math.max(0, (now.getTime() - input.previous.lastPositionAt.getTime()) / 1_000)
        : 10;

    // O player oferece 2x. A tolerância absorve jitter de rede, mas impede
    // transformar um seek grande ou `completed=true` em tempo realmente visto.
    const maximumCreditableDelta = Math.min(30, elapsedSeconds * 2.1);
    const creditedSeconds = input.previous
        ? Math.min(forwardDelta, maximumCreditableDelta)
        : Math.min(position, 15);
    const watchedSeconds = Math.floor((input.previous?.watchedSeconds ?? 0) + creditedSeconds);
    const completionThreshold = duration ? Math.max(1, Math.floor(duration * 0.9)) : null;
    const completed = Boolean(
        input.previous?.completed
        || (completionThreshold !== null
            && watchedSeconds >= completionThreshold
            && position >= completionThreshold)
    );

    return {
        position,
        watchedSeconds,
        lastPositionAt: now,
        completed,
        completedAt: completed ? (input.previous?.completedAt ?? now) : null
    };
}
