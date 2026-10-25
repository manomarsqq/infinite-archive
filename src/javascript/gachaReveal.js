export { gachaReveal }

/*
 * Reveal animations for the painted machines.
 *
 * The machines themselves are artwork (see .machine in index.html / style.css), so the
 * motion happens on their screens: the item screen cycles names like a slot reel and
 * then pops the result card in with a particle burst scaled to the rank tier; the curse
 * plate flickers and fills. Everything visual is a css class flipped here, the
 * durations are the constants below and must match style.css.
 *
 * Nothing in here knows about items or curses; pageHandler passes elements and callbacks.
 */

// particle count per tier
const PARTICLES = { low: 8, mid: 14, high: 22, top: 32 }

// timings in ms, paired with animation durations in style.css (noted on the right)
const REEL_MS = 1100        // how long the name reel spins
const REEL_STEP_MS = 55     // time per name on the reel, slows down towards the end
const FLICKER_MS = 650      // .flicker on the curse plate: plate-flicker keyframes

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
		const dist = 60 + Math.random() * 110
		particle.style.setProperty("--dx", `${Math.cos(angle) * dist}px`)
		particle.style.setProperty("--dy", `${Math.sin(angle) * dist}px`)
		particle.style.setProperty("--d", `${Math.random() * 0.2}s`)
		particle.style.setProperty("--c", i % 4 === 0 ? "#ffffff" : color) // every fourth is white for sparkle
		const size = 4 + Math.random() * 6
		particle.style.width = particle.style.height = `${size}px`
		container.appendChild(particle)
	}
}

class gachaReveal {

	/**
	 * item machine: spin the name reel on the screen, then show the card with a burst.
	 * returns { skip } to jump to the end early (a second click on the dial).
	 *
	 * @param {{
	 *   screen: HTMLElement,        the machine screen, gets .rolling while the reel spins
	 *   reel: HTMLElement,          text element the reel writes names into
	 *   stage: HTMLElement,         holds the burst and the card slot, gets .open at the end
	 *   burst: HTMLElement,
	 *   cardSlot: HTMLElement,
	 *   names: string[],            names to cycle through
	 *   card: HTMLElement,          the result card
	 *   color: string,              rank colour
	 *   tier: "low"|"mid"|"high"|"top",
	 *   onOpen?: () => void         called once when the card is shown
	 * }} opts
	 */
	static screenRoll(opts) {
		const timers = []
		let done = false

		opts.stage.className = "result-stage"
		opts.cardSlot.textContent = ""
		opts.screen.classList.remove("open", "idle")
		opts.screen.classList.add("rolling")
		opts.stage.style.setProperty("--c", opts.color)
		opts.card.style.setProperty("--c", opts.color)
		makeBurst(opts.burst, opts.color, opts.tier)

		function open() {
			if (done) return
			done = true
			timers.forEach(clearTimeout)
			opts.screen.classList.remove("rolling")
			opts.screen.classList.add("open")
			opts.reel.textContent = ""
			opts.cardSlot.appendChild(opts.card)
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
			step = REEL_STEP_MS + Math.round((elapsed / REEL_MS) * 120)
			if (elapsed >= REEL_MS) { timers.push(setTimeout(open, 180)); return }
			timers.push(setTimeout(tick, step))
		}
		tick()

		return { skip: open }
	}

	/**
	 * curse machine: flicker the plate, then fill it.
	 * @param {{
	 *   plate: HTMLElement,         the plate element, gets .flicker then .open
	 *   content: HTMLElement,       what to put on the plate
	 *   burst?: HTMLElement,
	 *   color?: string,
	 *   onOpen?: () => void
	 * }} opts
	 */
	static plateReveal(opts) {
		let done = false
		opts.plate.classList.remove("open", "idle")
		if (opts.burst) makeBurst(opts.burst, opts.color || "#A855F7", "mid")

		function open() {
			if (done) return
			done = true
			opts.plate.classList.remove("flicker")
			opts.plate.querySelector(".plate-slot").replaceChildren(opts.content)
			opts.plate.classList.add("open")
			if (typeof opts.onOpen === "function") opts.onOpen()
		}

		if (reducedMotion()) { open(); return { skip: open } }
		opts.plate.classList.add("flicker")
		const timer = setTimeout(open, FLICKER_MS)
		return { skip: () => { clearTimeout(timer); open() } }
	}
}
