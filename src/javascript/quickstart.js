export { quickstart }

/*
 * Quickstart tab.
 * Pick a start, pick a number of curses, and the site rolls everything:
 *   1. the start's tickets (the same numbers written on the Starting tab)
 *   2. N curses, drawn without repeats
 *   3. each curse's reward ("2x 4 Star") converted into more tickets
 *   4. one item per ticket, from the ranks that ticket can roll
 *
 * Only reads data and renders cards. pageHandler wires it up through quickstart.init(deps)
 * and owns the histories, saving and cookies.
 *
 * deps:
 *   randomCurses(n)               n distinct curses from the content-filtered pool
 *   randomItemForTicket(star)     random item for a star level, content filter applied
 *   buildItemCard(item)           result card element (with its Save button already wired)
 *   buildCurseCard(curse)         result card element
 *   onRolled(items, curses)       called after a roll so the normal histories pick it up
 *   onSaveAll(items, curses)      called by the "Save all to build" button
 *   toast(message)
 */

// key counts per start. keep in sync with the text on the Starting tab.
// starts with "roles" have a sub-choice (a <select> inside the option).
const STARTS = {
	"isekai-god": {
		label: "Thrown in by a god, an eldritch thing, or a wizard",
		tickets: [{ star: 4, n: 1 }, { star: 3, n: 2 }]
	},
	"isekai-truck": {
		label: "A new world, no wizard involved",
		tickets: [{ star: 3, n: 2 }, { star: 1, n: 3 }]
	},
	"native": {
		label: "Native to the world you chose",
		tickets: [{ star: 3, n: 3 }]
	},
	"transmigration": {
		label: "You woke up as an existing character",
		roles: {
			protagonist: { label: "the lead", tickets: [{ star: 1, n: 1 }] },
			secondary: { label: "a secondary character", tickets: [{ star: 2, n: 2 }] },
			tertiary: { label: "a bit part", tickets: [{ star: 3, n: 3 }] }
		}
	},
	"random": {
		label: "Someone in that world finds the key",
		roles: {
			plot: { label: "someone the plot cares about", tickets: [{ star: 2, n: 2 }] },
			side: { label: "someone it doesn't", tickets: [{ star: 3, n: 3 }] }
		}
	}
}

const EX_STAR = 8

function $(id) { return document.getElementById(id) }

function starLabel(star) {
	return star === EX_STAR ? "EX★" : star + "★"
}

class quickstart {
	#deps
	#lastRoll = null // { items, curses } of the most recent roll, for "Save all"

	/**
	 * @param {object} deps see the file header
	 */
	constructor(deps) {
		this.#deps = deps
	}

	/** wire the tab's controls. safe to call when the tab is not on the page. */
	init() {
		const slider = $("qsCurseCount")
		if (!slider) return
		const output = $("qsCurseCountOut")
		slider.addEventListener("input", () => { output.textContent = slider.value })

		// changing a role <select> should also select the start option it sits in,
		// and clicking it must not bubble to the <label> (which would re-toggle the radio)
		for (let id of ["qsTransmigrationRole", "qsRandomRole"]) {
			const select = $(id)
			select.addEventListener("change", () => {
				select.closest(".start-option").querySelector("input[type=radio]").checked = true
			})
			select.addEventListener("click", e => e.stopPropagation())
		}

		$("qsRollButton").addEventListener("click", () => this.roll())
		$("qsRerollButton").addEventListener("click", () => this.roll())
		$("qsSaveAllButton").addEventListener("click", (e) => this.#saveAll(e.currentTarget))
	}

	/** the checked start option, with its role sub-choice folded in -> { label, tickets } */
	#selectedStart() {
		const input = document.querySelector("input[name=qsStart]:checked")
		const key = input ? input.value : "isekai-god"
		const start = STARTS[key]
		if (!start.roles) return { label: start.label, tickets: start.tickets }

		const roleSelect = key === "transmigration" ? $("qsTransmigrationRole") : $("qsRandomRole")
		const role = start.roles[roleSelect.value] || Object.values(start.roles)[0]
		return { label: `${start.label} (${role.label})`, tickets: role.tickets }
	}

	/** do the whole roll, then render it and report it to pageHandler */
	roll() {
		const start = this.#selectedStart()
		const curseCount = parseInt($("qsCurseCount").value, 10) || 0
		const notes = [] // anything the user should know about (short pools, unreadable rewards)

		// 1. tickets from the start. each ticket remembers where it came from for the labels.
		const tickets = []
		for (let t of start.tickets) {
			for (let i = 0; i < t.n; i++) tickets.push({ star: t.star, source: "start" })
		}

		// 2. curses, no repeats
		const curses = this.#deps.randomCurses(curseCount)
		if (curses.length < curseCount) notes.push(`Only ${curses.length} curses available with your content settings.`)

		// 3. curse rewards -> more tickets
		for (let curse of curses) {
			const reward = curse.rewardTickets()
			if (!reward.length) {
				notes.push(`Could not read the reward "${curse.get("reward")}" for "${curse.get("name")}". Draw those keys by hand.`)
				continue
			}
			for (let r of reward) {
				for (let i = 0; i < r.n; i++) tickets.push({ star: r.star, source: curse.get("name") })
			}
		}

		// highest tickets first so the best pulls are at the top of the page
		tickets.sort((a, b) => b.star - a.star)

		// 4. one item per ticket
		const rolled = []
		for (let ticket of tickets) {
			const item = this.#deps.randomItemForTicket(ticket.star)
			if (!item) { notes.push(`No scrolls within reach of a ${starLabel(ticket.star)} key.`); continue }
			rolled.push({ ticket, item })
		}

		this.#lastRoll = { items: rolled.map(r => r.item), curses: curses }
		this.#render(start, tickets, curses, rolled, notes)
		this.#deps.onRolled(this.#lastRoll.items, this.#lastRoll.curses)
	}

	// "2× 3★" pill for the summary line. curse-sourced tickets are coloured differently.
	#ticketChip(star, n, fromCurse) {
		const chip = document.createElement("span")
		chip.className = "ticket-chip" + (fromCurse ? " from-curse" : "")
		chip.textContent = `${n}× ${starLabel(star)}` + (fromCurse ? " from curses" : "")
		chip.title = fromCurse ? "Keys paid out by a curse" : "Keys from your start"
		return chip
	}

	// summary line: which start, how many tickets, chips grouped by star level and source
	#renderSummary(start, tickets, notes) {
		const summary = $("qsSummary")
		summary.textContent = ""

		const startLine = document.createElement("div")
		startLine.className = "qs-summary-line"
		const startLabel = document.createElement("span")
		startLabel.className = "dim"
		startLabel.textContent = "Start: "
		const startName = document.createElement("strong")
		startName.textContent = start.label
		startLine.append(startLabel, startName)
		summary.appendChild(startLine)

		// group identical tickets: key is source type + star, e.g. "s3" or "c3"
		const groups = {}
		for (let t of tickets) {
			const fromCurse = t.source !== "start"
			const key = (fromCurse ? "c" : "s") + t.star
			groups[key] = groups[key] || { star: t.star, n: 0, fromCurse }
			groups[key].n++
		}

		const countLabel = document.createElement("span")
		countLabel.className = "dim"
		countLabel.textContent = `${tickets.length} key${tickets.length === 1 ? "" : "s"}:`
		summary.appendChild(countLabel)
		Object.values(groups)
			.sort((a, b) => (a.fromCurse - b.fromCurse) || (b.star - a.star)) // start tickets first, then by star
			.forEach(g => summary.appendChild(this.#ticketChip(g.star, g.n, g.fromCurse)))

		for (let text of notes) {
			const note = document.createElement("div")
			note.className = "dim qs-summary-line"
			note.textContent = "Note: " + text
			summary.appendChild(note)
		}
	}

	#render(start, tickets, curses, rolled, notes) {
		const results = $("qsResults")
		results.hidden = false

		this.#renderSummary(start, tickets, notes)

		// curse cards. --i staggers the card-rise animation (style.css)
		const curseCards = $("qsCurseCards")
		curseCards.textContent = ""
		$("qsCursesSection").hidden = curses.length === 0
		curses.forEach((curse, i) => {
			const card = this.#deps.buildCurseCard(curse)
			card.style.setProperty("--i", `${i * 0.06}s`)
			curseCards.appendChild(card)
		})

		// item cards, each labelled with the ticket that produced it
		const itemCards = $("qsItemCards")
		itemCards.textContent = ""
		rolled.forEach((r, i) => {
			const wrap = document.createElement("div")
			const label = document.createElement("div")
			label.className = "qs-ticket-label"
			label.textContent = r.ticket.source === "start"
				? `${starLabel(r.ticket.star)} key from your start`
				: `${starLabel(r.ticket.star)} key paid out by "${r.ticket.source}"`
			const card = this.#deps.buildItemCard(r.item)
			card.style.setProperty("--i", `${(curses.length + i) * 0.06}s`)
			wrap.append(label, card)
			itemCards.appendChild(wrap)
		})

		// a fresh roll can be saved again
		const saveAll = $("qsSaveAllButton")
		saveAll.disabled = false
		saveAll.textContent = "Keep all in codex"

		results.scrollIntoView({ behavior: "smooth", block: "start" })
	}

	// "Save all": hand everything to pageHandler once, then disable every save button in the results
	#saveAll(button) {
		if (!this.#lastRoll) return
		this.#deps.onSaveAll(this.#lastRoll.items, this.#lastRoll.curses)
		button.disabled = true
		button.textContent = "Kept"
		for (let b of document.querySelectorAll("#qsResults .rc-actions .default")) {
			b.disabled = true
			b.textContent = "Kept"
		}
	}
}
