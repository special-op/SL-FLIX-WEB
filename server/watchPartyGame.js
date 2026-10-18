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
    // Accept both conventional forms: include the leading article (TPB) or
    // omit it (PB). Punctuation has already become a separator here.
    const words = normalizeFullTitle(value)
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return [];
    const allWords = words.map(word => word[0]).join('');
    const meaningfulWords = words
        .filter(word => !/^(a|an|the)$/.test(word))
        .map(word => word[0])
        .join('');
    return [...new Set([allWords, meaningfulWords].filter(Boolean))];
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
        ? initialsForTitle(candidateOrAnswer)
        : [candidateOrAnswer?.title, candidateOrAnswer?.canonicalTitle, ...(Array.isArray(candidateOrAnswer?.aliases) ? candidateOrAnswer.aliases : [])]
            .flatMap(initialsForTitle)
            .filter(Boolean);
    if (!cleanGuess || !answers.length) return { valid: false, exact: false, initials: false, near: false, points: 0, tier: 'wrong', reason: 'invalid_guess' };
    if (fullGuess === fullTitle) return { valid: true, exact: true, initials: false, near: false, points: 5, tier: 'exact', reason: 'exact_title' };
    // Alternate/canonical names are valid, but only a full normalized title is
    // eligible for the exact-title bonus.
    if (answers.slice(1).includes(cleanGuess)) return { valid: true, exact: false, initials: false, near: false, points: 3, tier: 'close', reason: 'canonical_or_alias' };
    if (initials.includes(compactGuess(guess))) return { valid: true, exact: false, initials: true, near: false, points: 1, tier: 'initial', reason: 'initials' };

    const near = answers.some(answer => {
        if (cleanGuess.length >= 3 && (answer.includes(cleanGuess) || cleanGuess.includes(answer))) return true;
        const threshold = answer.length > 12 ? 3 : 2;
        return answer.length > 6 && editDistance(cleanGuess, answer) <= threshold;
    });
    return { valid: near, exact: false, initials: false, near, points: near ? 3 : 0, tier: near ? 'close' : 'wrong', reason: near ? 'near_match' : 'incorrect' };
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

// ---------------------------------------------------------------------------
// Generic watch-party games
// ---------------------------------------------------------------------------

const PARTY_GAME_TYPES = ['emoji', 'quote', 'character', 'scramble'];
const PARTY_GAME_MAX_ROUNDS = 50;
const PARTY_GAME_MAX_ROUND_MS = 120_000;
const PARTY_GAME_MIN_ROUND_MS = 1_000;
const TITLE_ARTICLES = new Set(['a', 'an', 'the']);

function boundedText(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}

function safePartyCandidate(candidate, index = 0) {
    if (!candidate || typeof candidate !== 'object') return null;
    const title = boundedText(candidate.title || candidate.name, 160);
    if (!title) return null;
    const aliases = Array.isArray(candidate.aliases)
        ? candidate.aliases.map(alias => boundedText(alias, 160)).filter(Boolean).slice(0, 10)
        : [];
    const quote = boundedText(candidate.quote || candidate.tagline || candidate.line || (Array.isArray(candidate.quotes) ? candidate.quotes[0] : ''), 500);
    const emoji = boundedText(candidate.emoji || candidate.emojis, 80);
    return {
        id: boundedText(candidate.id || `party-candidate-${index + 1}`, 100),
        title,
        ...(candidate.canonicalTitle ? { canonicalTitle: boundedText(candidate.canonicalTitle, 160) } : {}),
        ...(aliases.length ? { aliases } : {}),
        ...(candidate.posterUrl || candidate.imageUrl ? { imageUrl: boundedText(candidate.posterUrl || candidate.imageUrl, 1000) } : {}),
        ...(candidate.category ? { category: boundedText(candidate.category, 64) } : {}),
        ...(candidate.contentType || candidate.type ? { contentType: boundedText(candidate.contentType || candidate.type, 32) } : {}),
        ...(quote ? { quote } : {}),
        ...(emoji ? { emoji } : {})
    };
}

function safePartyCharacters(characters, fallbackTitle = '') {
    if (!Array.isArray(characters)) return [];
    return characters.map((character, index) => {
        if (!character || typeof character !== 'object') return null;
        const name = boundedText(character.character || character.characterName || character.name || character.role, 120);
        const title = boundedText(character.title || character.movieTitle || character.movie?.title || fallbackTitle, 160);
        if (!name || !title) return null;
        return {
            id: boundedText(character.id || `party-character-${index + 1}`, 100),
            name,
            title,
            imageUrl: boundedText(character.imageUrl || character.profileUrl || character.profile_path || character.posterUrl, 1000),
            category: boundedText(character.category, 64),
            contentType: boundedText(character.contentType || character.type || 'movie', 32)
        };
    }).filter(Boolean).slice(0, 100);
}

function titleWords(value) {
    return normalizeFullTitle(value).split(/\s+/).filter(word => word && !TITLE_ARTICLES.has(word));
}

const WORD_EMOJI = new Map([
    ['star', '⭐'], ['love', '❤️'], ['night', '🌙'], ['day', '☀️'], ['man', '🧔'],
    ['woman', '👩'], ['girl', '👧'], ['boy', '👦'], ['king', '👑'], ['queen', '👸'],
    ['war', '⚔️'], ['world', '🌍'], ['space', '🚀'], ['home', '🏠'], ['city', '🏙️'],
    ['school', '🏫'], ['road', '🛣️'], ['dark', '🌑'], ['red', '🔴'], ['blue', '🔵'],
    ['ghost', '👻'], ['life', '🌱'], ['dead', '💀'], ['time', '⏰'], ['dream', '💭'],
    ['fire', '🔥'], ['water', '💧'], ['heart', '❤️'], ['dragon', '🐉'], ['game', '🎮']
]);

function emojiForTitle(title) {
    const mapped = titleWords(title).map(word => WORD_EMOJI.get(word)).filter(Boolean);
    if (mapped.length) return mapped.slice(0, 6).join(' ');
    // A stable fallback is preferable to accepting arbitrary client markup.
    const symbols = ['🎬', '✨', '🍿', '🎭', '🌟', '🔍'];
    const seed = [...normalizeFullTitle(title)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return `${symbols[seed % symbols.length]} ${symbols[(seed + 2) % symbols.length]}`;
}

function scrambleTitle(title, seed = 0) {
    const chars = [...String(title)];
    if (chars.length < 2) return chars.join('');
    const offset = (seed + chars.length) % chars.length;
    const rotated = chars.slice(offset).concat(chars.slice(0, offset));
    const scrambled = rotated.reverse().join('');
    return scrambled === title ? chars.slice(1).concat(chars[0]).join('') : scrambled;
}

function safeRoundCount(value, fallback = 5) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(PARTY_GAME_MAX_ROUNDS, Math.max(1, Math.floor(number)));
}

function safeRoundMs(value, fallback = 20_000) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(PARTY_GAME_MAX_ROUND_MS, Math.max(PARTY_GAME_MIN_ROUND_MS, Math.floor(number)));
}

function partyRoundForType(type, candidate, character, index) {
    const isCharacterRound = type === 'character' && Boolean(character?.name);
    const answer = isCharacterRound ? character.name : (candidate?.title || '');
    const base = {
        id: `${type}-${index + 1}`,
        roundType: type,
        answer,
        canonicalTitle: isCharacterRound ? '' : (candidate?.canonicalTitle || ''),
        aliases: isCharacterRound ? [] : (candidate?.aliases || []),
        imageUrl: boundedText(character?.imageUrl || candidate?.imageUrl, 1000),
        category: boundedText(character?.category || candidate?.category, 64),
        contentType: boundedText(character?.contentType || candidate?.contentType, 32)
    };
    if (type === 'emoji') {
        const clue = candidate?.emoji || emojiForTitle(answer);
        return { ...base, prompt: 'Guess the movie from these emojis.', clue };
    }
    if (type === 'quote') {
        const clue = candidate?.quote || 'Name the movie this quote comes from.';
        return { ...base, prompt: 'Which movie is this quote from?', clue };
    }
    if (type === 'character') {
        return {
            ...base,
            prompt: 'Who is this character?',
            clue: character?.imageUrl ? 'Identify the character from the image.' : `Character from ${character?.title || 'the selected title'}`
        };
    }
    return { ...base, prompt: 'Unscramble the movie title.', clue: scrambleTitle(answer, index) };
}

function normalizePartyOptions(options = {}) {
    const movie = safePartyCandidate(options.movie, 0);
    const candidates = (Array.isArray(options.candidates) ? options.candidates : [])
        .slice(0, 50)
        .map((candidate, index) => safePartyCandidate(candidate, index))
        .filter(Boolean);
    if (movie && !candidates.some(candidate => normalizeGuess(candidate.title) === normalizeGuess(movie.title))) candidates.unshift(movie);
    const characters = safePartyCharacters(
        Array.isArray(options.characters) ? options.characters : (options.movie?.characters || options.movie?.cast),
        movie?.title || ''
    );
    const requestedRounds = options.rounds === 'custom'
        ? (options.customRounds ?? options.maxRounds)
        : options.rounds;
    return {
        type: options.gameType === 'mixed' || PARTY_GAME_TYPES.includes(options.gameType) ? options.gameType : 'emoji',
        rounds: safeRoundCount(requestedRounds),
        roundMs: safeRoundMs(options.roundMs),
        candidates,
        characters
    };
}

/** Build all answer-bearing data on the server; callers must use getPublicPartyGame for clients. */
export function createPartyGame(options = {}, now = Date.now()) {
    const normalized = normalizePartyOptions(options);
    const sourceCandidates = normalized.candidates;
    const sourceCharacters = normalized.characters;
    const rounds = [];
    for (let index = 0; index < normalized.rounds; index += 1) {
        const roundType = normalized.type === 'mixed' ? PARTY_GAME_TYPES[index % PARTY_GAME_TYPES.length] : normalized.type;
        const candidate = sourceCandidates[index % sourceCandidates.length];
        const character = sourceCharacters.length ? sourceCharacters[index % sourceCharacters.length] : null;
        const selectedCandidate = candidate || (character ? safePartyCandidate({ title: character.title, id: character.id, category: character.category, contentType: character.contentType, imageUrl: character.imageUrl }) : null);
        if (!selectedCandidate) break;
        rounds.push(partyRoundForType(roundType, selectedCandidate, roundType === 'character' ? character : null, index));
    }
    const effectiveRounds = rounds.length;
    const first = rounds[0];
    return {
        type: 'party_game',
        gameType: normalized.type,
        status: first ? 'active' : 'finished',
        round: first ? 1 : 0,
        maxRounds: effectiveRounds,
        startedAt: now,
        endsAt: first ? now + normalized.roundMs : now,
        roundMs: normalized.roundMs,
        rounds,
        currentRound: 0,
        scores: {},
        submissions: {},
        attempts: [],
        revealed: false,
        timer: null
    };
}

export function nextPartyGameRound(previous, now = Date.now()) {
    if (!previous || previous.round >= previous.maxRounds) return null;
    const nextRound = previous.currentRound + 1;
    return {
        ...previous,
        status: 'active',
        round: nextRound + 1,
        currentRound: nextRound,
        startedAt: now,
        endsAt: now + safeRoundMs(previous.roundMs),
        submissions: {},
        attempts: [],
        revealed: false,
        timer: null
    };
}

export function getPublicPartyGame(game) {
    if (!game) return null;
    const round = game.rounds?.[game.currentRound];
    const publicGame = {
        type: 'party_game',
        status: game.status,
        gameType: game.gameType,
        round: game.round,
        maxRounds: game.maxRounds,
        startedAt: game.startedAt,
        endsAt: game.endsAt,
        prompt: round?.prompt || '',
        clue: round?.clue || '',
        imageUrl: round?.imageUrl || '',
        category: round?.category || undefined,
        contentType: round?.contentType || undefined,
        ...(round?.roundType ? { roundType: round.roundType } : {}),
        scores: { ...(game.scores || {}) },
        revealed: Boolean(game.revealed || game.status !== 'active')
    };
    if (publicGame.revealed && round) {
        publicGame.answer = round.answer;
    }
    return publicGame;
}

export function scorePartyGameGuess(game, playerName, guess, now = Date.now()) {
    if (!game || game.status !== 'active' || !playerName) return { accepted: false, points: 0, tier: 'wrong', reason: 'inactive_game' };
    const key = normalizeDisplayNameForGame(playerName);
    if (!key) return { accepted: false, points: 0, tier: 'wrong', reason: 'invalid_player' };
    if (game.submissions?.[key]) return { accepted: false, duplicate: true, points: 0, tier: 'wrong', reason: 'already_submitted' };
    const round = game.rounds?.[game.currentRound];
    if (!round) return { accepted: false, points: 0, tier: 'wrong', reason: 'missing_round' };
    const result = classifyGuess(guess, { title: round.answer, canonicalTitle: round.canonicalTitle, aliases: round.aliases });
    game.submissions = game.submissions || {};
    game.submissions[key] = { username: boundedText(playerName, 40), at: now, points: result.points, tier: result.tier };
    game.attempts = Array.isArray(game.attempts) ? game.attempts : [];
    game.attempts.push({ username: boundedText(playerName, 40), points: result.points, tier: result.tier, at: now });
    game.scores[playerName] = Number(game.scores[playerName] || 0) + result.points;
    return { accepted: true, points: result.points, tier: result.tier, reason: result.reason, scores: { ...game.scores } };
}

function normalizeDisplayNameForGame(value) {
    return boundedText(value, 40).toLocaleLowerCase();
}

export function cleanupPartyGame(room) {
    if (room?.partyGame?.timer) clearTimeout(room.partyGame.timer);
    if (room && Object.prototype.hasOwnProperty.call(room, 'partyGame')) delete room.partyGame;
}
