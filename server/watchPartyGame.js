const ARTICLES = /^(a|an|the)\s+/i;

export function normalizeGuess(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(ARTICLES, '')
        .trim();
}

export function editDistance(left, right) {
    const a = normalizeGuess(left);
    const b = normalizeGuess(right);
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= b.length; j += 1) {
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
    }
    return previous[b.length];
}

export function isCorrectGuess(guess, answer) {
    const cleanGuess = normalizeGuess(guess);
    const cleanAnswer = normalizeGuess(answer);
    if (!cleanGuess || !cleanAnswer) return false;
    if (cleanGuess === cleanAnswer) return true;
    return cleanAnswer.length > 6 && editDistance(cleanGuess, cleanAnswer) <= 2;
}

export function scoreForCorrectGuess(correctGuessCount) {
    return Math.max(0, 3 - Number(correctGuessCount || 0));
}

export function allowGuessRate(timestamps, now = Date.now()) {
    const recent = (Array.isArray(timestamps) ? timestamps : []).filter(timestamp => now - timestamp < 1000);
    return { allowed: recent.length < 3, timestamps: [...recent, now] };
}

export function createGuessPosterGame(candidates, now = Date.now(), roundMs = 20_000) {
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const answerIndex = Math.floor(Math.random() * safeCandidates.length);
    const answer = safeCandidates[answerIndex];
    return {
        status: 'active',
        round: 1,
        maxRounds: 5,
        startedAt: now,
        endsAt: now + roundMs,
        candidates: safeCandidates,
        answerId: answer.id,
        answerTitle: answer.title,
        answerPosterUrl: answer.posterUrl || '',
        scores: {},
        correctGuesses: [],
        revealed: false,
        roundGuessCount: 0,
    };
}

export function cleanupGuessPosterGame(room) {
    if (room && Object.prototype.hasOwnProperty.call(room, 'guessPosterGame')) delete room.guessPosterGame;
}

export function getPublicGuessPosterGame(game) {
    if (!game) return null;
    return {
        status: game.status,
        round: game.round,
        maxRounds: game.maxRounds,
        startedAt: game.startedAt,
        endsAt: game.endsAt,
        posterUrl: game.answerPosterUrl || '',
        scores: { ...game.scores },
        revealed: Boolean(game.revealed),
        ...(game.revealed ? { answerTitle: game.answerTitle } : {}),
    };
}
