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
    return unused[Math.floor(Math.random() * unused.length)] || null;
}

export function createGuessPosterGame(candidates, now = Date.now(), roundMs = 20_000) {
    const seenIds = new Set();
    const seenTitles = new Set();
    const safeCandidates = (Array.isArray(candidates) ? candidates : [])
        .map(safePosterCandidate)
        .filter(candidate => {
            if (!candidate?.id || !candidate.title) return false;
            const titleKey = normalizeGuess(candidate.title);
            if (seenIds.has(candidate.id) || !titleKey || seenTitles.has(titleKey)) return false;
            seenIds.add(candidate.id);
            seenTitles.add(titleKey);
            return true;
        });
    const answer = chooseCandidate(safeCandidates);
    // Every round must have a new answer. The server therefore caps the game at
    // the number of distinct titles instead of cycling a small client pool.
    const maxRounds = Math.min(5, safeCandidates.length);
    return {
        status: answer ? 'active' : 'finished',
        round: answer ? 1 : 0,
        maxRounds,
        startedAt: now,
        endsAt: answer ? now + roundMs : now,
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
    if (!answer) return null;
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

const TRIVIA_PROMPT_TYPES = ['genre', 'release', 'type', 'country', 'cast', 'description', 'tagline', 'title'];
const TRIVIA_PROMPT_VARIANTS = {
    genre: [
        'Which title is the {value} genre selection in this watch party?',
        'From the {value} category entries, which title is correct?'
    ],
    release: [
        'Which title was released in {value}?',
        'Choose the title associated with the {value} release year.'
    ],
    type: [
        'Which title is classified as a {value}?',
        'Which title matches the {value} content type?'
    ],
    country: [
        'Which title is associated with the {value} country?',
        'Choose the title from the {value} country collection.'
    ],
    cast: [
        'Which title features {value}?',
        'Select the title connected to {value}.'
    ],
    description: [
        'Which title matches this description: "{value}"?',
        'Choose the title described by: "{value}".'
    ],
    tagline: [
        'Which title uses this tagline: "{value}"?',
        'Choose the title represented by the tagline "{value}".'
    ],
    title: [
        'Which title belongs to this watch-party clue?',
        'Choose the title that matches this round.'
    ]
};

function triviaList(value, maxItems = 8, maxLength = 120) {
    const values = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? value.split(/[,|/]/) : []);
    const seen = new Set();
    return values
        .map(item => {
            if (item && typeof item === 'object') return boundedText(item.name || item.title || item.value, maxLength);
            return boundedText(item, maxLength);
        })
        .filter(item => {
            const key = normalizeGuess(item);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, maxItems);
}

function triviaCastList(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(entry => {
        if (!entry || typeof entry !== 'object') return null;
        const name = boundedText(entry.name || entry.actor || entry.performer || entry.staffName, 120);
        const character = boundedText(entry.character || entry.characterName || entry.role, 120);
        const answer = character || name;
        const key = normalizeGuess(answer);
        if (!answer || !key || seen.has(key)) return null;
        seen.add(key);
        return { name, character, answer };
    }).filter(Boolean).slice(0, 12);
}

function safeTriviaSource(source, index = 0) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const title = boundedText(source.title || source.name, 160);
    if (!title) return null;
    const id = boundedText(source.id || source.subjectId || source.detailPath || `trivia-candidate-${index + 1}`, 100);
    const genres = triviaList(source.genre || source.genres || source.category, 8, 80);
    const countries = triviaList(source.countryName || source.country || source.countries, 6, 80);
    const releaseDate = boundedText(source.releaseDate || source.release_date || source.publishDate || source.publish_date, 32);
    const releaseYear = boundedText(source.year, 8) || (releaseDate.match(/\b(?:19|20)\d{2}\b/) || [])[0] || '';
    const contentType = boundedText(source.contentType || source.mediaType || source.type, 48);
    const description = boundedText(source.description || source.overview || source.synopsis || source.summary || source.introduction, 360);
    const tagline = boundedText(source.tagline || source.quote || source.line, 240);
    const cast = triviaCastList(source.cast || source.characters);
    return {
        id: id || `trivia-candidate-${index + 1}`,
        title,
        genres,
        countries,
        releaseDate,
        releaseYear,
        contentType,
        description,
        tagline,
        cast,
        category: boundedText(source.category || genres[0], 80)
    };
}

function mergeTriviaSource(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    return {
        ...existing,
        id: existing.id || incoming.id,
        genres: existing.genres.length ? existing.genres : incoming.genres,
        countries: existing.countries.length ? existing.countries : incoming.countries,
        releaseDate: existing.releaseDate || incoming.releaseDate,
        releaseYear: existing.releaseYear || incoming.releaseYear,
        contentType: existing.contentType || incoming.contentType,
        description: existing.description || incoming.description,
        tagline: existing.tagline || incoming.tagline,
        cast: existing.cast.length ? existing.cast : incoming.cast,
        category: existing.category || incoming.category
    };
}

function triviaPromptValue(candidate, type) {
    if (type === 'genre') return candidate.genres[0] || candidate.category;
    if (type === 'release') return candidate.releaseYear || candidate.releaseDate;
    if (type === 'type') return candidate.contentType;
    if (type === 'country') return candidate.countries[0];
    if (type === 'cast') {
        const cast = candidate.cast[0];
        return cast ? (cast.character ? `the character ${cast.character}` : `the performer ${cast.name}`) : '';
    }
    if (type === 'description') return candidate.description;
    if (type === 'tagline') return candidate.tagline;
    return '';
}

function availableTriviaPromptTypes(candidate) {
    return TRIVIA_PROMPT_TYPES.filter(type => type === 'title' || Boolean(triviaPromptValue(candidate, type)));
}

function triviaQuestionId(type, candidate, index, usedIds) {
    const base = `${type}-${candidate.id || candidate.title}-${index + 1}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90) || `trivia-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`.slice(0, 100);
    usedIds.add(id);
    return id;
}

function uniqueTriviaOptions(answer, candidates, index) {
    const values = [answer, ...candidates.map(candidate => candidate.title)];
    const seen = new Set();
    const options = values.filter(value => {
        const clean = boundedText(value, 160);
        const key = normalizeGuess(clean);
        if (!clean || !key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 4);
    if (options.length < 2) return [];
    const shift = index % options.length;
    return options.slice(shift).concat(options.slice(0, shift));
}

/** Build server-owned trivia rounds from safe movie metadata and title choices. */
export function buildMovieTriviaQuestions(payload = {}) {
    const input = payload && typeof payload === 'object' ? payload : {};
    if (Array.isArray(input.questions) && input.questions.length) {
        return input.questions.slice(0, 20);
    }
    const rawSources = [input.movie, ...(Array.isArray(input.candidates) ? input.candidates : [])];
    const byTitle = new Map();
    rawSources.forEach((source, index) => {
        const candidate = safeTriviaSource(source, index);
        const key = candidate && normalizeGuess(candidate.title);
        if (!candidate || !key) return;
        byTitle.set(key, mergeTriviaSource(byTitle.get(key), candidate));
    });
    const candidates = Array.from(byTitle.values());
    if (candidates.length < 2) return [];
    const requestedValue = Number(input.maxRounds);
    const requestedRounds = Number.isFinite(requestedValue)
        ? Math.min(20, Math.max(1, Math.floor(requestedValue)))
        : Math.min(5, candidates.length);
    const questions = [];
    const usedIds = new Set();
    const usedPrompts = new Set();
    let promptCursor = 0;
    for (let index = 0; index < candidates.length && questions.length < requestedRounds; index += 1) {
        const candidate = candidates[index];
        const available = availableTriviaPromptTypes(candidate);
        const preferred = TRIVIA_PROMPT_TYPES.slice(promptCursor).concat(TRIVIA_PROMPT_TYPES.slice(0, promptCursor));
        const type = preferred.find(value => available.includes(value)) || 'title';
        promptCursor = (TRIVIA_PROMPT_TYPES.indexOf(type) + 1) % TRIVIA_PROMPT_TYPES.length;
        const value = triviaPromptValue(candidate, type);
        const variants = TRIVIA_PROMPT_VARIANTS[type] || TRIVIA_PROMPT_VARIANTS.title;
        const template = variants[index % variants.length];
        let question = template.replace('{value}', value);
        const promptKey = normalizeGuess(question);
        if (usedPrompts.has(promptKey)) question = `${question} (Clue ${questions.length + 1})`;
        usedPrompts.add(normalizeGuess(question));
        const options = uniqueTriviaOptions(candidate.title, candidates, index);
        if (!options.length) continue;
        questions.push({
            id: triviaQuestionId(type, candidate, index, usedIds),
            question,
            options,
            answerIndex: options.findIndex(option => normalizeGuess(option) === normalizeGuess(candidate.title)),
            category: candidate.genres[0] || candidate.category || candidate.contentType || ''
        });
    }
    return questions;
}

function safeTriviaQuestion(question, index) {
    if (!question || typeof question !== 'object') return null;
    const prompt = String(question.question ?? question.prompt ?? '').trim().slice(0, 500);
    const rawOptions = Array.isArray(question.options)
        ? question.options.map(option => String(option).trim().slice(0, 160)).filter(Boolean).slice(0, 6)
        : [];
    const answerValue = Number.isInteger(question.answerIndex) ? rawOptions[question.answerIndex] : question.answer;
    const seenOptions = new Set();
    const options = rawOptions.filter(option => {
        const key = normalizeGuess(option);
        if (!key || seenOptions.has(key)) return false;
        seenOptions.add(key);
        return true;
    });
    const answerIndex = options.findIndex(option => normalizeGuess(option) === normalizeGuess(answerValue));
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
    const seenIds = new Set();
    const seenPrompts = new Set();
    const safeQuestions = (Array.isArray(questions) ? questions : [])
        .map(safeTriviaQuestion)
        .filter(question => {
            if (!question) return false;
            const promptKey = normalizeGuess(question.question);
            if (seenIds.has(question.id) || seenPrompts.has(promptKey)) return false;
            seenIds.add(question.id);
            seenPrompts.add(promptKey);
            return true;
        })
        .slice(0, 20);
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
    const seenNames = new Set();
    return characters.map((character, index) => {
        if (!character || typeof character !== 'object') return null;
        const name = boundedText(character.character || character.characterName || character.name || character.role, 120);
        const title = boundedText(character.title || character.movieTitle || character.movie?.title || fallbackTitle, 160);
        const nameKey = normalizeGuess(name);
        if (!name || !nameKey || seenNames.has(nameKey)) return null;
        seenNames.add(nameKey);
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

function emojiForTitle(title, variation = 0) {
    const mapped = titleWords(title).map(word => WORD_EMOJI.get(word)).filter(Boolean);
    if (mapped.length) {
        const rotated = mapped.slice(variation % mapped.length).concat(mapped.slice(0, variation % mapped.length));
        return rotated.slice(0, 6).join(' ');
    }
    // A stable fallback is preferable to accepting arbitrary client markup.
    const symbols = ['🎬', '✨', '🍿', '🎭', '🌟', '🔍'];
    const seed = [...normalizeFullTitle(title)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return `${symbols[(seed + variation) % symbols.length]} ${symbols[(seed + variation + 2) % symbols.length]}`;
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

function partyClueKey(value) {
    return boundedText(value, 500).toLocaleLowerCase().replace(/\s+/g, ' ');
}

function uniquePartyClue(clue, usedClues = new Set()) {
    const clean = boundedText(clue, 500);
    if (!clean || !usedClues.has(partyClueKey(clean))) return clean;
    const suffixes = ['🎬', '✨', '🍿', '🎭', '🌟', '🔍'];
    for (const suffix of suffixes) {
        const variant = `${clean} ${suffix}`;
        if (!usedClues.has(partyClueKey(variant))) return variant;
    }
    return `${clean} ${usedClues.size + 1}`;
}

function partyRoundForType(type, candidate, character, index, usedClues = new Set()) {
    const isCharacterRound = type === 'character' && Boolean(character?.name);
    if (type === 'character' && !isCharacterRound) return null;
    const answer = isCharacterRound ? character.name : (candidate?.title || '');
    if (!answer) return null;
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
        const clue = uniquePartyClue(candidate?.emoji || emojiForTitle(answer, index), usedClues);
        return { ...base, prompt: ['Guess the movie from these emojis.', 'Which title do these symbols describe?', 'Name the movie hidden in this emoji trail.'][index % 3], clue };
    }
    if (type === 'quote') {
        const clue = boundedText(candidate?.quote, 500);
        if (!clue) return null;
        return { ...base, prompt: ['Which title is this line from?', 'Name the movie behind this quote.', 'Which watch-party title uses this line?'][index % 3], clue };
    }
    if (type === 'character') {
        return {
            ...base,
            prompt: ['Who is this character?', 'Which character is shown here?', 'Name the character from this title.'][index % 3],
            clue: character?.imageUrl ? 'Identify the character from the image.' : `Character from ${character?.title || 'the selected title'}`
        };
    }
    if ([...answer].length < 2) return null;
    return { ...base, prompt: ['Unscramble the movie title.', 'Put this title back in order.', 'Which title is hidden in this scramble?'][index % 3], clue: uniquePartyClue(scrambleTitle(answer, index), usedClues) };
}

function normalizePartyOptions(options = {}) {
    const movie = safePartyCandidate(options.movie, 0);
    const seenCandidateTitles = new Set();
    const candidates = (Array.isArray(options.candidates) ? options.candidates : [])
        .slice(0, 50)
        .map((candidate, index) => safePartyCandidate(candidate, index))
        .filter(candidate => {
            const key = candidate && normalizeGuess(candidate.title);
            if (!candidate || !key || seenCandidateTitles.has(key)) return false;
            seenCandidateTitles.add(key);
            return true;
        });
    if (movie && !seenCandidateTitles.has(normalizeGuess(movie.title))) {
        candidates.unshift(movie);
        seenCandidateTitles.add(normalizeGuess(movie.title));
    }
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
    const usedCandidateTitles = new Set();
    const usedCharacterNames = new Set();
    const usedAnswers = new Set();
    const usedClues = new Set();
    let typeCursor = 0;

    const findCandidate = (type) => {
        for (let offset = 0; offset < sourceCandidates.length; offset += 1) {
            const candidate = sourceCandidates[(offset + typeCursor) % sourceCandidates.length];
            const titleKey = normalizeGuess(candidate.title);
            if (usedCandidateTitles.has(titleKey)) continue;
            if (type === 'quote' && !candidate.quote) continue;
            if (type === 'quote' && usedClues.has(partyClueKey(candidate.quote))) continue;
            if (type === 'scramble' && [...candidate.title].length < 2) continue;
            if (type === 'scramble' && usedClues.has(partyClueKey(scrambleTitle(candidate.title, rounds.length)))) continue;
            return candidate;
        }
        return null;
    };

    const findCharacter = () => {
        const availableCharacters = sourceCharacters.filter(character => (
            !character.title || !usedCandidateTitles.has(normalizeGuess(character.title))
        ));
        const pool = availableCharacters.length ? availableCharacters : sourceCharacters;
        for (let offset = 0; offset < pool.length; offset += 1) {
            const character = pool[(offset + typeCursor) % pool.length];
            const nameKey = normalizeGuess(character.name);
            if (!nameKey || usedCharacterNames.has(nameKey) || usedAnswers.has(nameKey)) continue;
            return character;
        }
        return null;
    };

    for (let attempt = 0; attempt < normalized.rounds; attempt += 1) {
        const typesToTry = normalized.type === 'mixed'
            ? PARTY_GAME_TYPES.map((_, offset) => PARTY_GAME_TYPES[(typeCursor + offset) % PARTY_GAME_TYPES.length])
            : [normalized.type];
        let madeRound = false;
        for (const roundType of typesToTry) {
            const character = roundType === 'character' ? findCharacter() : null;
            const candidate = roundType === 'character' ? null : findCandidate(roundType);
            if (roundType === 'character' && !character) continue;
            if (roundType !== 'character' && !candidate) continue;
            const selectedCandidate = candidate || (character ? safePartyCandidate({
                title: character.title || 'Character round',
                id: character.id,
                category: character.category,
                contentType: character.contentType,
                imageUrl: character.imageUrl
            }) : null);
            const round = partyRoundForType(roundType, selectedCandidate, character, rounds.length, usedClues);
            if (!round) continue;
            const answerKey = normalizeGuess(round.answer);
            const clueKey = partyClueKey(round.clue);
            if (!answerKey || usedAnswers.has(answerKey) || (roundType !== 'character' && usedClues.has(clueKey))) continue;
            rounds.push(round);
            usedAnswers.add(answerKey);
            usedClues.add(clueKey);
            if (roundType === 'character') {
                usedCharacterNames.add(normalizeGuess(character.name));
                if (character.title) usedCandidateTitles.add(normalizeGuess(character.title));
            } else {
                usedCandidateTitles.add(normalizeGuess(candidate.title));
            }
            typeCursor = normalized.type === 'mixed'
                ? (PARTY_GAME_TYPES.indexOf(roundType) + 1) % PARTY_GAME_TYPES.length
                : typeCursor;
            madeRound = true;
            break;
        }
        if (!madeRound) break;
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
