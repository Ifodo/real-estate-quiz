/* IGetHouse Property Quiz Logic */

/** @typedef {{ question: string; options: string[]; answerIndex: number; }} QuizQuestion */

(function () {
	'use strict';

	/** DOM Elements */
	const questionTextEl = document.getElementById('question-text');
	const optionsContainerEl = document.getElementById('options-container');
	const timerTextEl = document.getElementById('timer-text');
	const timerProgressEl = document.getElementById('timer-progress');
	const progressCurrentEl = document.getElementById('progress-current');
	const progressTotalEl = document.getElementById('progress-total');
	const nextBtnEl = document.getElementById('next-btn');
	const skipBtnEl = document.getElementById('skip-btn');
	const resultModalEl = document.getElementById('result-modal');
	const scoreTextEl = document.getElementById('score-text');
	const scoreTotalEl = document.getElementById('score-total');
	const playAgainBtnEl = document.getElementById('play-again-btn');
	const brandLogoEl = document.getElementById('brand-logo');
	const metaThemeColorEl = document.getElementById('meta-theme-color');

	/** State */
	/** @type {QuizQuestion[]} */
	let questions = Array.isArray(window.PROPERTY_QUIZ_QUESTIONS) ? [...window.PROPERTY_QUIZ_QUESTIONS] : [];
	let currentQuestionIndex = 0;
	let score = 0;
	let isLocked = false;
	let timerIntervalId = null;
	let timeLimitSeconds = 15;
	const circumference = 2 * Math.PI * 62; // r = 62, matches SVG
	let autoAdvanceTimeoutId = null;

	function shuffleInPlace(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	/** Color utilities */
	function rgbToHsl(r, g, b) {
		r /= 255; g /= 255; b /= 255;
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		let h = 0, s = 0, l = (max + min) / 2;
		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r: h = (g - b) / d + (g < b ? 6 : 1); break;
				case g: h = (b - r) / d + 3; break;
				case b: h = (r - g) / d + 5; break;
			}
			h *= 60;
		}
		return { h, s, l };
	}

	function hslToCss({ h, s, l }) {
		return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
	}

	function adjustLightness(hsl, delta) {
		return { h: hsl.h, s: hsl.s, l: clamp(hsl.l + delta, 0, 1) };
	}

	function setThemeFromColor(rgb) {
		const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
		const brand = hslToCss(hsl);
		const brand600 = hslToCss(adjustLightness(hsl, -0.08));
		const brand700 = hslToCss(adjustLightness(hsl, -0.16));
		document.documentElement.style.setProperty('--brand', brand);
		document.documentElement.style.setProperty('--brand-600', brand600);
		document.documentElement.style.setProperty('--brand-700', brand700);
		if (metaThemeColorEl) metaThemeColorEl.setAttribute('content', brand);
	}

	function extractDominantColorFromImage(imgEl) {
		try {
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return null;
			const w = 80;
			const h = 80;
			canvas.width = w; canvas.height = h;
			ctx.drawImage(imgEl, 0, 0, w, h);
			const { data } = ctx.getImageData(0, 0, w, h);
			let rSum = 0, gSum = 0, bSum = 0, count = 0;
			for (let i = 0; i < data.length; i += 4) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				const a = data[i + 3];
				if (a < 200) continue; // skip transparent
				// skip near white/black to avoid background bias
				const max = Math.max(r, g, b), min = Math.min(r, g, b);
				if (max < 30 || min > 230) continue;
				rSum += r; gSum += g; bSum += b; count++;
			}
			if (count === 0) return null;
			return { r: Math.round(rSum / count), g: Math.round(gSum / count), b: Math.round(bSum / count) };
		} catch (e) {
			return null;
		}
	}

	function applyLogoTheme() {
		if (!brandLogoEl || !(brandLogoEl instanceof HTMLImageElement)) return;
		if (brandLogoEl.complete) {
			const rgb = extractDominantColorFromImage(brandLogoEl);
			if (rgb) setThemeFromColor(rgb);
			return;
		}
		brandLogoEl.addEventListener('load', () => {
			const rgb = extractDominantColorFromImage(brandLogoEl);
			if (rgb) setThemeFromColor(rgb);
		});
	}

	function resetTimerVisual() {
		timerProgressEl.setAttribute('stroke-dasharray', `${circumference}`);
		timerProgressEl.setAttribute('stroke-dashoffset', '0');
		timerTextEl.textContent = `${timeLimitSeconds}`;
	}

	function startTimer(onElapsed) {
		clearInterval(timerIntervalId);
		resetTimerVisual();
		const start = performance.now();
		const totalMs = timeLimitSeconds * 1000;
		timerIntervalId = setInterval(() => {
			const elapsed = performance.now() - start;
			const remaining = Math.max(0, totalMs - elapsed);
			const secondsRemaining = Math.ceil(remaining / 1000);
			timerTextEl.textContent = `${secondsRemaining}`;
			const progress = remaining / totalMs; // 1 -> 0
			const offset = circumference * (1 - progress);
			timerProgressEl.setAttribute('stroke-dashoffset', `${offset}`);
			if (remaining <= 0) {
				clearInterval(timerIntervalId);
				onElapsed();
			}
		}, 100);
	}

	function stopTimer() {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}

	function renderQuestion(index) {
		const q = questions[index];
		questionTextEl.textContent = q.question;
		progressCurrentEl.textContent = `${index + 1}`;
		progressTotalEl.textContent = `${questions.length}`;

		// Build options
		optionsContainerEl.innerHTML = '';
		isLocked = false;

		q.options.forEach((optionText, optionIndex) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = [
				'group relative w-full text-left rounded-lg px-4 py-3',
				'bg-slate-50 hover:bg-slate-100',
				'ring-1 ring-slate-200',
				'text-slate-800',
				'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-white',
				'transition-colors'
			].join(' ');
			button.setAttribute('aria-pressed', 'false');
			button.setAttribute('tabindex', '0');
			button.dataset.index = String(optionIndex);
			button.innerHTML = `
				<span class="inline-flex items-center justify-center h-6 w-6 mr-3 rounded-md text-xs font-semibold ring-1 ring-slate-300 bg-white group-hover:bg-[color:rgb(248,250,252)]">${String.fromCharCode(65 + optionIndex)}</span>
				<span class="align-middle">${optionText}</span>
			`;

			// Keyboard support
			button.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter' || ev.key === ' ') {
					ev.preventDefault();
					button.click();
				}
			});

			button.addEventListener('click', () => {
				if (isLocked) return;
				selectAnswer(optionIndex);
			});

			optionsContainerEl.appendChild(button);
		});

		nextBtnEl.disabled = true;
		startTimer(handleTimeElapsed);
	}

	function markOptionButtons(correctIndex, selectedIndex) {
		const children = Array.from(optionsContainerEl.children);
		children.forEach((child, idx) => {
			if (!(child instanceof HTMLButtonElement)) return;
			child.disabled = true;
			child.classList.remove('bg-slate-50', 'hover:bg-slate-100');
			if (idx === correctIndex) {
				child.classList.add('bg-[var(--brand)]', 'text-white', 'ring-[var(--brand)]');
			} else if (selectedIndex === idx) {
				child.classList.add('bg-red-100', 'text-red-800', 'ring-red-300');
			} else {
				child.classList.add('opacity-60');
			}
		});
	}

	function selectAnswer(optionIndex) {
		if (isLocked) return;
		isLocked = true;
		stopTimer();
		const q = questions[currentQuestionIndex];
		const isCorrect = optionIndex === q.answerIndex;
		if (isCorrect) score += 1;
		markOptionButtons(q.answerIndex, optionIndex);
		nextBtnEl.disabled = false;
		queueAutoAdvance();
	}

	function handleTimeElapsed() {
		if (isLocked) return;
		isLocked = true;
		const q = questions[currentQuestionIndex];
		markOptionButtons(q.answerIndex, -1);
		nextBtnEl.disabled = false;
		queueAutoAdvance();
	}

	function queueAutoAdvance() {
		clearTimeout(autoAdvanceTimeoutId);
		autoAdvanceTimeoutId = setTimeout(() => {
			nextQuestion();
		}, 900);
	}

	function nextQuestion() {
		clearTimeout(autoAdvanceTimeoutId);
		if (currentQuestionIndex + 1 >= questions.length) {
			showResults();
			return;
		}
		currentQuestionIndex += 1;
		renderQuestion(currentQuestionIndex);
	}

	function skipQuestion() {
		if (isLocked) return; // prevent skipping after selection
		stopTimer();
		isLocked = true;
		queueAutoAdvance();
	}

	function showResults() {
		stopTimer();
		resultModalEl.classList.remove('hidden');
		scoreTextEl.textContent = String(score);
		scoreTotalEl.textContent = String(questions.length);
		// Trap focus on modal action buttons
		const focusable = resultModalEl.querySelector('a, button');
		if (focusable) focusable.focus();
	}

	function hideResults() {
		resultModalEl.classList.add('hidden');
	}

	function resetQuiz() {
		stopTimer();
		currentQuestionIndex = 0;
		score = 0;
		hideResults();
		questions = Array.isArray(window.PROPERTY_QUIZ_QUESTIONS) ? [...window.PROPERTY_QUIZ_QUESTIONS] : [];
		shuffleInPlace(questions);
		renderQuestion(currentQuestionIndex);
	}

	function initEventListeners() {
		nextBtnEl.addEventListener('click', () => {
			nextQuestion();
		});
		skipBtnEl.addEventListener('click', () => {
			skipQuestion();
		});
		playAgainBtnEl.addEventListener('click', () => {
			resetQuiz();
		});
		// Close modal on backdrop click
		resultModalEl.addEventListener('click', (ev) => {
			if (ev.target === resultModalEl) hideResults();
		});
	}

	function init() {
		/* theme fixed via CSS variables */
		initEventListeners();
		if (!Array.isArray(questions) || questions.length === 0) {
			questionTextEl.textContent = 'No questions available.';
			progressTotalEl.textContent = '0';
			return;
		}
		shuffleInPlace(questions);
		progressTotalEl.textContent = `${questions.length}`;
		renderQuestion(currentQuestionIndex);
	}

	document.addEventListener('DOMContentLoaded', init);
})(); 