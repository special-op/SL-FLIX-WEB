const ARTICLES = /^(a|an|the)\s+/i;

function normalizeFullTitle(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeGuess(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
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

function candidateAnswers(candidate) {
    if (!candidate || typeof candidate !== 'object') return [];
    return [candidate.title, candidate.canonicalTitle, ...(Array.isArray(candidate.aliases) ? candidate.aliases : [])]
        .map(normalizeGuess)
        .filter(Boolean);
}

function initialsForTitle(value) {
    const words = normalizeFullTitle(value).split(/\s+/).filter(Boolean);
    return words.length > 1 ? words.map(word => word[0]).join('') : '';
}

function compactGuess(value) {
    return normalizeGuess(value).replace(/\s/g, '');
}

/** Return the score without revealing which answer was matched. */
export function classifyGuess(guess, candidateOrAnswer) {
    const cleanGuess = normalizeGuess(guess);
    const isStringAnswer = typeof candidateOrAnswer === 'string';
    const title = isStringAnswer ? normalizeGuess(candidateOrAnswer) : normalizeGuess(candidateOrAnswer?.title);
    const fullGuess = normalizeFullTitle(guess);
    const fullTitle = isStringAnswer ? normalizeFullTitle(candidateOrAnswer) : normalizeFullTitle(candidateOrAnswer?.title);
    const answers = isStringAnswer ? [title] : candidateAnswers(candidateOrAnswer);
    const initials = isStringAnswer
        ? [initialsForTitle(candidateOrAnswer)]
        : [candidateOrAnswer?.title, candidateOrAnswer?.canonicalTitle, ...(Array.isArray(candidateOrAnswer?.aliases) ? candidateOrAnswer.aliases : [])]
            .map(initialsForTitle)
            .filter(Boolean);
    if (!cleanGuess || !answers.length || cleanGuess.length < 2) return { valid: false, exact: false, initials: false, near: false, points: 0, reason: 'invalid_guess' };
    if (fullGuess === fullTitle) return { valid: true, exact: true, initials: false, near: false, points: 5, reason: 'exact_title' };
    // Alternate/canonical names are valid, but only a full normalized title is
    // eligible for the exact-title bonus.
    if (answers.slice(1).includes(cleanGuess)) return { valid: true, exact: false, initials: false, near: false, points: 3, reason: 'canonical_or_alias' };
    if (initials.includes(compactGuess(guess))) return { valid: true, exact: false, initials: true, near: false, points: 1, reason: 'initials' };

    const near = answers.some(answer => {
        if (cleanGuess.length >= 3 && (answer.includes(cleanGuess) || cleanGuess.includes(answer))) return true;
        const threshold = answer.length > 12 ? 3 : 2;
        return answer.length > 6 && editDistance(cleanGuess, answer) <= threshold;
    });
    return { valid: near, exact: false, initials: false, near, points: near ? 3 : 0, reason: near ? 'near_match' : 'incorrect' };
}

export function scoreGuess(guess, candidateOrAnswer) {
    return classifyGuess(guess, candidateOrAnswer).points;
}

export function isCorrectGuess(guess, answer) {
    return classifyGuess(guess, answer).valid;
}

// Keep the old count-based helper compatible for existing clients/tests. New game
// code uses scoreGuess so an exact title is worth five, initials one, and a valid
// near/alias answer three.
export function scoreForCorrectGuess(correctGuessCount, candidateOrAnswer) {
    if (arguments.length > 1 && typeof correctGuessCount === 'string') {
        return scoreGuess(correctGuessCount, candidateOrAnswer);
    }
    return Math.max(0, 3 - Number(correctGuessCount || 0));
}

export function allowGuessRate(timestamps, now = Date.now()) {
    const recent = (Array.isArray(timestamps) ? timestamps : []).filter(timestamp => now - timestamp < 1000);
    return { allowed: recent.length < 3, timestamps: [...recent, now] };
}

function safePosterCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    return {
        id: String(candidate.id || '').trim().slice(0, 100),
        title: String(candidate.title || '').trim().slice(0, 160),
        posterUrl: String(candidate.posterUrl || '').trim().slice(0, 1000),
        ...(candidate.canonicalTitle ? { canonicalTitle: String(candidate.canonicalTitle).trim().slice(0, 160) } : {}),
        ...(Array.isArray(candidate.aliases) ? { aliases: candidate.aliases.map(alias => String(alias).trim().slice(0, 160)).filter(Boolean).slice(0, 10) } : {}),
        ...(candidate.contentType ? { contentType: String(candidate.contentType).trim().slice(0, 32) } : {}),
        ...(candidate.category ? { category: String(candidate.category).trim().slice(0, 64) } : {}),
    };
}

function chooseCandidate(candidates, usedIds = []) {
    const unused = candidates.filter(candidate => !usedIds.includes(candidate.id));
    const pool = unused.length ? unused : candidates;
    return pool[Math.floor(Math.random() * pool.length)] || null;
}

export function createGuessPosterGame(candidates, now = Date.now(), roundMs = 20_000) {
    const safeCandidates = (Array.isArray(candidates) ? candidates : []).map(safePosterCandidate).filter(candidate => candidate?.id && candidate.title);
    const answer = chooseCandidate(safeCandidates);
    // A single supplied title is still a valid five-round game; selection falls
    // back to the candidate pool once every title has appeared.
    const maxRounds = safeCandidates.length ? 5 : 1;
    return {
        status: 'active',
        round: 1,
        maxRounds,
        startedAt: now,
        endsAt: now + roundMs,
        candidates: safeCandidates,
        usedAnswerIds: answer ? [answer.id] : [],
        answerId: answer?.id || '',
        answerTitle: answer?.title || '',
        answerCanonicalTitle: answer?.canonicalTitle || '',
        answerAliases: answer?.aliases || [],
        answerPosterUrl: answer?.posterUrl || '',
        answerContentType: answer?.contentType || '',
        answerCategory: answer?.category || '',
        scores: {},
        correctGuesses: [],
        attempts: [],
        revealed: false,
        roundGuessCount: 0,
        guessTimestamps: [],
    };
}

export function nextGuessPosterRound(previous, now = Date.now(), roundMs = 20_000) {
    if (!previous || previous.round >= previous.maxRounds) return null;
    const answer = chooseCandidate(previous.candidates || [], previous.usedAnswerIds || []);
    return {
        ...previous,
        status: 'active',
        round: previous.round + 1,
        startedAt: now,
        endsAt: now + roundMs,
        usedAnswerIds: [...(previous.usedAnswerIds || []), ...(answer ? [answer.id] : [])],
        answerId: answer?.id || '',
        answerTitle: answer?.title || '',
        answerCanonicalTitle: answer?.canonicalTitle || '',
        answerAliases: answer?.aliases || [],
        answerPosterUrl: answer?.posterUrl || '',
        answerContentType: answer?.contentType || '',
        answerCategory: answer?.category || '',
        correctGuesses: [],
        attempts: [],
        revealed: false,
        roundGuessCount: 0,
        guessTimestamps: [],
    };
}

export function cleanupGuessPosterGame(room) {
    if (room?.guessPosterGame?.timer) clearTimeout(room.guessPosterGame.timer);
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
        contentType: game.answerContentType || undefined,
        category: game.answerCategory || undefined,
        scores: { ...game.scores },
        attemptSummary: (game.attempts || []).reduce((summary, attempt) => {
            const current = summary[attempt.username] || { attempts: 0, failures: 0, points: 0 };
            current.attempts += 1;
            current.points += Number(attempt.points || 0);
            if (!attempt.points) current.failures += 1;
            summary[attempt.username] = current;
            return summary;
        }, {}),
        revealed: Boolean(game.revealed),
        ...(game.revealed ? {
            answerId: game.answerId,
            answerTitle: game.answerTitle,
            answerContentType: game.answerContentType || undefined,
            answerCategory: game.answerCategory || undefined,
        } : {}),
    };
}

function safeTriviaQuestion(question, index) {
    if (!question || typeof question !== 'object') return null;
    const prompt = String(question.question ?? question.prompt ?? '').trim().slice(0, 500);
    const options = Array.isArray(question.options)
        ? question.options.map(option => String(option).trim().slice(0, 160)).filter(Boolean).slice(0, 6)
        : [];
    const answerIndex = Number.isInteger(question.answerIndex) ? question.answerIndex : options.findIndex(option => normalizeGuess(option) === normalizeGuess(question.answer));
    if (!prompt || options.length < 2 || answerIndex < 0 || answerIndex >= options.length) return null;
    return {
        id: String(question.id || `trivia-${index + 1}`).trim().slice(0, 100),
        question: prompt,
        options,
        answerIndex,
        ...(question.category ? { category: String(question.category).trim().slice(0, 64) } : {}),
        explanation: question.explanation ? String(question.explanation).trim().slice(0, 300) : '',
    };
}

export function createMovieTriviaGame(questions, now = Date.now(), roundMs = 20_000) {
    const safeQuestions = (Array.isArray(questions) ? questions : []).map(safeTriviaQuestion).filter(Boolean).slice(0, 20);
    const first = safeQuestions[0];
    return {
        type: 'movie_trivia',
        status: first ? 'active' : 'finished',
        round: 1,
        maxRounds: safeQuestions.length,
        startedAt: now,
        endsAt: now + roundMs,
        roundMs,
        questions: safeQuestions,
        scores: {},
        answeredPlayers: [],
        answered: {},
        attempts: [],
        failedAnswers: [],
        currentQuestion: 0,
        timer: null,
    };
}

export function getPublicMovieTriviaGame(game) {
    if (!game) return null;
    const question = game.questions?.[game.currentQuestion];
    return {
        type: 'movie_trivia',
        status: game.status,
        round: game.round,
        maxRounds: game.maxRounds,
        startedAt: game.startedAt,
        endsAt: game.endsAt,
        question: question ? { id: question.id, question: question.question, options: [...question.options] } : null,
        // Flat aliases keep the game consumable by older watch-party clients.
        prompt: question?.question || '',
        choices: question ? [...question.options] : [],
        ...(question?.category ? { category: question.category } : {}),
        scores: { ...game.scores },
        attemptSummary: (game.attempts || []).reduce((summary, attempt) => {
            const current = summary[attempt.username] || { attempts: 0, failures: 0, points: 0 };
            current.attempts += 1;
            current.points += Number(attempt.points || 0);
            if (!attempt.correct) current.failures += 1;
            summary[attempt.username] = current;
            return summary;
        }, {}),
        revealed: game.status !== 'active',
        ...(game.status !== 'active' && question ? {
            answerIndex: question.answerIndex,
            correctChoice: question.options[question.answerIndex],
            ...(question.explanation ? { explanation: question.explanation } : {}),
        } : {}),
    };
}

export function scoreTriviaAnswer(game, playerName, answerIndex) {
    if (!game || game.status !== 'active' || !playerName || !Number.isInteger(answerIndex)) return { accepted: false, correct: false, points: 0, reason: 'invalid_answer' };
    if (game.answeredPlayers.some(name => normalizeGuess(name) === normalizeGuess(playerName))) return { accepted: false, correct: false, points: 0, duplicate: true, reason: 'already_answered' };
    const question = game.questions?.[game.currentQuestion];
    if (!question || answerIndex < 0 || answerIndex >= question.options.length) return { accepted: false, correct: false, points: 0, reason: 'invalid_answer' };
    const correct = answerIndex === question.answerIndex;
    const points = correct ? 1 : 0;
    game.answeredPlayers.push(playerName);
    game.answered[playerName] = { answerIndex, correct, points };
    game.attempts = Array.isArray(game.attempts) ? game.attempts : [];
    game.failedAnswers = Array.isArray(game.failedAnswers) ? game.failedAnswers : [];
    game.attempts.push({ username: playerName, answerIndex, correct, points, reason: correct ? 'correct' : 'incorrect', at: Date.now() });
    if (!correct) game.failedAnswers.push({ username: playerName, answerIndex, reason: 'incorrect', at: Date.now() });
    game.scores[playerName] = Number(game.scores[playerName] || 0) + points;
    return { accepted: true, correct, points, reason: correct ? 'correct' : 'incorrect' };
}
