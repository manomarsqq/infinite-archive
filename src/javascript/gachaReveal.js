export { gachaReveal }

/*
 * Reveal animation for the draw stages on the Draw page.
 *
 * A stage moves through three states, each a class on the stage element:
 *   idle     nothing drawn yet, shows the placeholder
 *   rolling  names flicker past on the reel, slowing down
 *   open     the result card is in, with a particle burst scaled to the rank tier
 * Everything visual lives in style.css (.stage, .reel, .burst, card-in); the timings below
 * are the only numbers that have to agree with it.
 *
 * Nothing in here knows about items or curses; pageHandler passes elements and callbacks.
 */

// particle count per tier
const PARTICLES = { low: 10, mid: 16, high: 26, top: 38 }

// timings in ms
const REEL_MS = 1000        // how long the name reel spins
const REEL_STEP_MS = 50     // time per name on the reel, slows down towards the end

function reducedMotion() {
	return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * particle spans for the burst. each gets a direction (--dx/--dy), delay (--d) and colour (--c)
 * that the "particle" keyframes in style.css use.
 * @param {HTMLElement} container
 * @param {string} color
 * @param {"low"|"mid"|"high"|"top"} tier
 */
function makeBurst(container, color, tier) {
	container.textContent = ""
	const count = PARTICLES[tier] || PARTICLES.low
	for (let i = 0; i < count; i++) {
		const particle = document.createElement("span")
		const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
		const dist = 90 + Math.random() * 160
		particle.style.setProperty("--dx", `${Math.cos(angle) * dist}px`)
		particle.style.setProperty("--dy", `${Math.sin(angle) * dist * 0.7}px`)
		particle.style.setProperty("--d", `${Math.random() * 0.2}s`)
		particle.style.setProperty("--c", i % 4 === 0 ? "#ffffff" : color) // every fourth is white for sparkle
		const size = 3 + Math.random() * 6
		particle.style.width = particle.style.height = `${size}px`
		container.appendChild(particle)
	}
}

class gachaReveal {

	/**
	 * spin the name reel on a stage, then show the card with a burst.
	 * returns { skip } to jump to the end early (a second click on the draw button).
	 *
	 * @param {{
	 *   stage: HTMLElement,         the stage, gets .rolling and then .open
	 *   reel: HTMLElement,          text element the reel writes names into
	 *   burst: HTMLElement,
	 *   cardSlot: HTMLElement,
	 *   names: string[],            names to cycle through
	 *   card: HTMLElement,          the result card
	 *   color: string,              accent colour (rank or severity)
	 *   tier: "low"|"mid"|"high"|"top",
	 *   onOpen?: () => void         called once when the card is shown
	 * }} opts
	 */
	static stageRoll(opts) {
		const timers = []
		let done = false

		opts.cardSlot.textContent = ""
		opts.stage.classList.remove("open", "idle", "tier-low", "tier-mid", "tier-high", "tier-top")
		opts.stage.classList.add("rolling")
		opts.stage.style.setProperty("--c", opts.color)
		makeBurst(opts.burst, opts.color, opts.tier)

		function open() {
			if (done) return
			done = true
			timers.forEach(clearTimeout)
			opts.reel.textContent = ""
			opts.cardSlot.appendChild(opts.card)
			opts.stage.classList.remove("rolling")
			// restart the open animations even when the previous draw left the class on
			void opts.stage.offsetWidth
			opts.stage.classList.add("open", "tier-" + opts.tier)
			if (typeof opts.onOpen === "function") opts.onOpen()
		}

		if (reducedMotion() || !opts.names.length) {
			open()
			return { skip: open }
		}

		// the reel: random names, stepping slower as it runs out of time
		let elapsed = 0
		let step = REEL_STEP_MS
		function tick() {
			opts.reel.textContent = opts.names[Math.floor(Math.random() * opts.names.length)]
			elapsed += step
			step = REEL_STEP_MS + Math.round((elapsed / REEL_MS) * 110)
			if (elapsed >= REEL_MS) { timers.push(setTimeout(open, 160)); return }
			timers.push(setTimeout(tick, step))
		}
		tick()

		return { skip: open }
	}
}
