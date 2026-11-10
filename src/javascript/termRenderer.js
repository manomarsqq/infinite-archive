import { gachaItem } from "./gachaItem.js"
import { gachaCurse } from "./gachaCurse.js"
import { filteringHandler } from "./filteringHandler.js"
import { copyToClipboard } from "./utils.js"
import { KEY_LABELS, keyLabel, sourceLabel } from "./ledger.js"

// how the archive delivers each kind of scroll; shown as a line on every result card
const SCROLL_INTRO = {
	ability: (n) => `Unfurled, the scroll gives up its secret, and you know how to use ${n}.`,
	skill: (n) => `The letters lift from the page and settle into your mind as knowledge: ${n}.`,
	passive: (n) => `The scroll's magic turns on you and weaves ${n} into what you are.`,
	race: (n) => `The scroll's magic turns on you and remakes you: ${n}.`,
	familiar: (n) => `Words of summoning rise off the page, and ${n} answers.`,
	world: (n) => `The words spread past you and into the world itself: ${n}.`,
	default: (n) => `The words leave the page and take shape before you: ${n}.`,
}

export { termRenderer }

// every ball and token image as a url, keyed by file name without extension ("ability", "3_star"…)
const ballFiles = import.meta.glob("/assets/svg/balls/*.svg", { query: "?url", import: "default", eager: true })
const tokenFiles = import.meta.glob("/assets/svg/tokens/*.svg", { query: "?url", import: "default", eager: true })

function fileMap(files) {
	const map = {}
	for (let path in files) map[path.split("/").pop().replace(".svg", "")] = files[path]
	return map
}
const balls = fileMap(ballFiles)
const tokens = fileMap(tokenFiles)

/**
 * turns gachaItems and gachaCurses into DOM: table headers, table rows with badges,
 * and result cards.
 * reads nothing from the page and keeps no state; pageHandler decides where things go.
 */
class termRenderer {

	/** css custom property holding each rank's colour, same order as filteringHandler.rankOrder (defined in style.css) */
	static rankCssVars = ["--Frank", "--Erank", "--Drank", "--Crank", "--Brank", "--Arank", "--Srank", "--SSrank", "--SSSrank", "--EXrank"]

	/**
	 * the flavour line for an item, by category
	 * @param {gachaItem} item 
	 * @returns {string}
	 */
	static scrollIntro(item) {
		const make = SCROLL_INTRO[String(item.get("category")).toLowerCase()] || SCROLL_INTRO.default
		return make(item.get("name"))
	}

	/**
	 * url of the ball image for an item category
	 * @param {string} category
	 * @returns {string|undefined}
	 */
	static ballUrl(category) {
		return balls[String(category).toLowerCase()]
	}

	/**
	 * url of the key token image for a star level. 0 is the "any rank" key.
	 * @param {number|string} star 0-8
	 * @returns {string|undefined}
	 */
	static tokenUrl(star) {
		const n = parseInt(star)
		if (!n) return tokens["randomticket"]
		return tokens[n === 8 ? "ex_star" : `${n}_star`]
	}

	/**
	 * css colour for a rank, read from the stylesheet so the palette lives in one place
	 * @param {string} rank
	 * @returns {string}
	 */
	static rankColor(rank) {
		const index = filteringHandler.rankOrder.indexOf(String(rank).toUpperCase())
		if (index === -1) return "#64748B"
		return getComputedStyle(document.documentElement).getPropertyValue(termRenderer.rankCssVars[index]).trim()
	}

	/**
	 * "low" | "mid" | "high" | "top": how dramatic a reveal should be
	 * @param {string} rank
	 */
	static rankTier(rank) {
		const index = filteringHandler.rankOrder.indexOf(String(rank).toUpperCase())
		if (index <= 2) return "low"
		if (index <= 5) return "mid"
		if (index <= 7) return "high"
		return "top"
	}

	/**
	 * rank -> number for sorting. unknown ranks sort as -1.
	 * @param {string} rank
	 */
	static rankToNumber(rank) {
		return filteringHandler.rankOrder.indexOf(String(rank).toUpperCase())
	}

	// ---------------------------------------------------------------- small pieces

	static element(tag, className, text) {
		const el = document.createElement(tag)
		if (className) el.className = className
		if (text !== undefined) el.textContent = text
		return el
	}

	/** coloured pill for the Rank column */
	static rankBadge(rank) {
		const badge = termRenderer.element("span", `rank-badge rank-${String(rank).toUpperCase()}`, rank)
		badge.style.setProperty("--rank-color", termRenderer.rankColor(rank))
		return badge
	}

	/** stat letter coloured by its rank */
	static statLetter(value) {
		const span = termRenderer.element("span", "stat-letter", value)
		span.style.setProperty("--rank-color", termRenderer.rankColor(value))
		return span
	}

	/** check / dash for boolean columns */
	static boolBadge(value) {
		const span = termRenderer.element("span", "bool-badge " + (value ? "yes" : "no"), value ? "✓" : "–")
		span.title = value ? "Yes" : "No"
		return span
	}

	/** severity pill for curses */
	static severityBadge(curse) {
		const badge = termRenderer.element("span", "sev-badge sev-" + curse.severity(), curse.get("level"))
		badge.style.setProperty("--rank-color", termRenderer.severityColor(curse))
		return badge
	}

	/** reward pill for curses */
	static rewardChip(curse) {
		return termRenderer.element("span", "reward-chip", curse.get("reward"))
	}

	static chip(text, extraClass) {
		return termRenderer.element("span", "chip" + (extraClass ? " " + extraClass : ""), text)
	}

	// ---------------------------------------------------------------- tables

	/** the short column set used by data-columns="compact" tables (history and codex) */
	static compactColumns = {
		items: ["name", "category", "rank", "stats"],
		curses: ["name", "level", "target", "reward"],
	}

	/**
	 * the {key, label} columns a table shows
	 * @param {"items"|"curses"} kind
	 * @param {boolean} [compact]
	 */
	static columnsFor(kind, compact) {
		const columns = kind === "curses" ? gachaCurse.columns : gachaItem.columns
		if (!compact) return columns
		const keys = termRenderer.compactColumns[kind === "curses" ? "curses" : "items"]
		return keys.map(key => columns.find(column => column.key === key))
	}

	/**
	 * build thead/tbody for a table from the term's columns.
	 * headers get data-key so pageHandler can sort on click.
	 * @param {HTMLTableElement} table
	 * @param {"items"|"curses"} kind
	 * @param {string} [extraColumn] trailing column for a button, e.g. "Keep"
	 * @param {boolean} [compact] the short column set
	 */
	static buildTableHeader(table, kind, extraColumn, compact) {
		const thead = document.createElement("thead")
		const row = document.createElement("tr")
		for (let column of termRenderer.columnsFor(kind, compact)) {
			const th = termRenderer.element("th", "sortable", column.label)
			th.dataset.key = column.key
			if (column.key === "stats") th.classList.add("num")
			row.appendChild(th)
		}
		if (extraColumn) row.appendChild(termRenderer.element("th", "action-col", ""))
		thead.appendChild(row)
		table.textContent = ""
		table.classList.toggle("compact", !!compact)
		table.append(thead, document.createElement("tbody"))
	}

	/**
	 * a table row for an item or curse. rank, stat, boolean and severity columns get badges,
	 * long text columns get wrapping classes. the whole row opens the entry (onOpen) on click or Enter.
	 * @param {gachaItem|gachaCurse} term
	 * @param {{compact?: boolean, onOpen?: () => void}} [options]
	 * @returns {HTMLTableRowElement}
	 */
	static createRow(term, options = {}) {
		const row = document.createElement("tr")
		const isItem = term instanceof gachaItem
		const keys = options.compact ? termRenderer.compactColumns[isItem ? "items" : "curses"] : term.keys()

		for (let key of keys) {
			const value = term.get(key)
			let cell
			if (key === "name") {
				cell = termRenderer.cell(value, "cell-name")
				// compact item rows carry the series under the name instead of in a column
				if (options.compact && isItem && term.get("series")) cell.appendChild(termRenderer.element("span", "cell-sub", term.get("series")))
			}
			else if (isItem) {
				if (key === "series") cell = termRenderer.cell(value, "cell-text")
				else if (key === "description") cell = termRenderer.cell(value, "cell-desc")
				else if (key === "category") cell = termRenderer.cell(termRenderer.categoryTag(value))
				else if (gachaItem.statKeys.indexOf(key) !== -1) cell = termRenderer.cell(termRenderer.statLetter(value), "cell-center")
				else if (key === "stats") cell = termRenderer.cell(Number(value).toLocaleString(), "cell-num")
				else if (key === "rank") cell = termRenderer.cell(termRenderer.rankBadge(value), "cell-center")
				else if (key === "gift" || key === "nsfw") cell = termRenderer.cell(termRenderer.boolBadge(value), "cell-center")
				else cell = termRenderer.cell(value)
			} else {
				if (key === "description" || key === "resolution") cell = termRenderer.cell(value, "cell-desc")
				else if (key === "level") cell = termRenderer.cell(termRenderer.severityBadge(term))
				else if (key === "nsfw") cell = termRenderer.cell(termRenderer.boolBadge(value), "cell-center")
				else if (key === "reward") cell = termRenderer.cell(termRenderer.rewardChip(term))
				else cell = termRenderer.cell(value)
			}
			row.appendChild(cell)
		}

		if (typeof options.onOpen === "function") {
			row.classList.add("openable")
			row.tabIndex = 0
			row.addEventListener("click", (event) => {
				if (event.target.closest("button, a, input")) return
				options.onOpen()
			})
			row.addEventListener("keydown", (event) => {
				if (event.key === "Enter" && event.target === row) options.onOpen()
			})
		}
		return row
	}

	/** td holding text or an element */
	static cell(content, className) {
		const td = document.createElement("td")
		if (className) td.className = className
		if (content instanceof Node) td.appendChild(content)
		else td.textContent = content
		return td
	}

	/** small category label with its shelf icon */
	static categoryTag(category) {
		const tag = termRenderer.element("span", "cat-tag")
		const url = termRenderer.ballUrl(category)
		if (url) {
			const img = document.createElement("img")
			img.src = url
			img.alt = ""
			tag.appendChild(img)
		}
		tag.appendChild(document.createTextNode(category))
		return tag
	}

	// ---------------------------------------------------------------- ledger

	/**
	 * "21:14" today, "Nov 9, 21:14" this year, "Nov 9, 2025, 21:14" before that
	 * @param {number} ms
	 * @returns {string}
	 */
	static formatWhen(ms) {
		const date = new Date(ms)
		const now = new Date()
		const time = { hour: "2-digit", minute: "2-digit" }
		if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(undefined, time)
		const day = { month: "short", day: "numeric", ...time }
		if (date.getFullYear() !== now.getFullYear()) day.year = "numeric"
		return date.toLocaleString(undefined, day)
	}

	/**
	 * one line of provenance for a card: "Drawn with 4★ Gold on the Draw page, 21:14"
	 * @param {object} record a ledger record
	 * @returns {string}
	 */
	static provenance(record) {
		const when = termRenderer.formatWhen(record.at)
		const source = sourceLabel(record)
		if (record.kind === "curses") return `${source} · ${when}`
		return `${keyLabel(record.star)} · ${source} · ${when}`
	}

	/**
	 * thead/tbody for a ledger table
	 * @param {HTMLTableElement} table
	 * @param {"items"|"curses"|"all"} view
	 */
	static buildLedgerHeader(table, view) {
		const labels = {
			items: ["When", "Key", "Scroll", "Rank", "Note"],
			curses: ["When", "Pays", "Curse", "Severity", "Note"],
			all: ["When", "Key", "Entry", "Rank", "Note"],
		}[view] || []
		const row = document.createElement("tr")
		for (let label of labels) row.appendChild(termRenderer.element("th", "", label))
		row.appendChild(termRenderer.element("th", "action-col", ""))
		const thead = document.createElement("thead")
		thead.appendChild(row)
		table.textContent = ""
		table.append(thead, document.createElement("tbody"))
	}

	/**
	 * a ledger row: when, the key (a picker for scrolls, the payout for curses), the entry, its grade,
	 * an editable note, and keep / forget buttons. the row opens the entry on click outside the controls.
	 * @param {object} record a ledger record
	 * @param {gachaItem|gachaCurse|undefined} term the entry, undefined when it is no longer in the data
	 * @param {{
	 *   view: "items"|"curses"|"all",
	 *   onOpen?: () => void,
	 *   onKey?: (star: number|null) => void,
	 *   onNote?: (note: string) => void,
	 *   onKeep?: () => void,
	 *   onForget?: () => void
	 * }} options
	 * @returns {HTMLTableRowElement}
	 */
	static buildLedgerRow(record, term, options) {
		const row = document.createElement("tr")
		const isItem = record.kind === "items"
		row.classList.toggle("is-kept", record.kept)

		// when
		const time = termRenderer.element("time", "", termRenderer.formatWhen(record.at))
		time.dateTime = new Date(record.at).toISOString()
		time.title = new Date(record.at).toLocaleString()
		row.appendChild(termRenderer.cell(time, "cell-when"))

		// key, or what a curse pays
		const keyCell = termRenderer.cell("", "cell-key")
		if (isItem) {
			const select = termRenderer.element("select", "key-select")
			select.setAttribute("aria-label", `Key for ${record.name}`)
			select.appendChild(new Option("Key not set", ""))
			KEY_LABELS.forEach((label, star) => select.appendChild(new Option(label, String(star))))
			select.value = record.star === null ? "" : String(record.star)
			select.classList.toggle("unset", record.star === null)
			select.addEventListener("change", () => {
				const star = select.value === "" ? null : Number(select.value)
				select.classList.toggle("unset", star === null)
				if (options.onKey) options.onKey(star)
			})
			keyCell.appendChild(select)
		} else {
			keyCell.appendChild(term ? termRenderer.rewardChip(term) : termRenderer.element("span", "dim", "–"))
		}
		keyCell.appendChild(termRenderer.element("span", "cell-sub", sourceLabel(record)))
		row.appendChild(keyCell)

		// the entry
		const name = termRenderer.cell(record.name, "cell-name")
		let sub = term ? (isItem ? term.get("series") : `Target: ${term.get("target")}`) : "No longer in the archive"
		if (options.view === "all") sub = (isItem ? "Scroll" : "Curse") + (sub ? ` · ${sub}` : "")
		if (sub) name.appendChild(termRenderer.element("span", "cell-sub", sub))
		row.appendChild(name)

		// rank or severity
		let grade
		if (!term) grade = termRenderer.element("span", "dim", "?")
		else grade = isItem ? termRenderer.rankBadge(term.get("rank")) : termRenderer.severityBadge(term)
		row.appendChild(termRenderer.cell(grade, isItem ? "cell-center" : ""))

		// note
		const note = termRenderer.element("input", "note-input")
		note.type = "text"
		note.value = record.note
		note.placeholder = isItem ? "What earned the key?" : "Why it was bound"
		note.setAttribute("aria-label", `Note for ${record.name}`)
		note.addEventListener("change", () => { if (options.onNote) options.onNote(note.value) })
		note.addEventListener("keydown", (event) => { if (event.key === "Enter") note.blur() })
		row.appendChild(termRenderer.cell(note, "cell-note"))

		// keep / kept, forget
		const actions = termRenderer.cell("", "cell-action")
		const wrap = termRenderer.element("div", "row-actions")
		if (record.kept) {
			wrap.appendChild(termRenderer.element("span", "kept-tag", isItem ? "Kept" : "Bound"))
		} else if (term && options.onKeep) {
			const keep = termRenderer.element("button", "btn small", isItem ? "Keep" : "Bind")
			keep.addEventListener("click", options.onKeep)
			wrap.appendChild(keep)
		}
		if (options.onForget) {
			const forget = termRenderer.element("button", "btn small ghost forget", "✕")
			forget.title = "Forget this draw"
			forget.setAttribute("aria-label", `Forget the draw of ${record.name}`)
			forget.addEventListener("click", options.onForget)
			wrap.appendChild(forget)
		}
		actions.appendChild(wrap)
		row.appendChild(actions)

		if (term && typeof options.onOpen === "function") {
			row.classList.add("openable")
			row.addEventListener("click", (event) => {
				if (event.target.closest("button, a, input, select")) return
				options.onOpen()
			})
		}
		return row
	}

	// ---------------------------------------------------------------- cards

	/** accent colour per curse severity, used for the card edge and the reveal burst */
	static severityColors = { minor: "#3BA99C", moderate: "#E3A33B", major: "#E0524D", "": "#9B6BF0" }

	/**
	 * @param {gachaCurse} curse
	 * @returns {string}
	 */
	static severityColor(curse) {
		return termRenderer.severityColors[curse.severity()] || termRenderer.severityColors[""]
	}

	/**
	 * how dramatic a curse reveal should be
	 * @param {gachaCurse} curse
	 * @returns {"low"|"mid"|"high"}
	 */
	static severityTier(curse) {
		return { minor: "low", moderate: "mid", major: "high" }[curse.severity()] || "mid"
	}

	/**
	 * "Keep in codex" + "Copy" row at the bottom of a card. without onSave only Copy is shown.
	 * @param {gachaItem|gachaCurse} term
	 * @param {(term) => void} [onSave]
	 */
	static cardActions(term, onSave) {
		const isItem = term instanceof gachaItem
		const actions = termRenderer.element("div", "rc-actions")
		if (typeof onSave === "function") {
			const save = termRenderer.element("button", "btn primary", isItem ? "Keep in codex" : "Bind to codex")
			save.addEventListener("click", () => {
				onSave(term)
				save.textContent = isItem ? "Kept" : "Bound"
				save.disabled = true
			})
			actions.appendChild(save)
		}
		const copy = termRenderer.element("button", "btn ghost", "Copy as text")
		copy.addEventListener("click", () => copyToClipboard(term.toString(), isItem ? "Scroll" : "Curse"))
		actions.appendChild(copy)
		return actions
	}

	/**
	 * result card for an item: title with category and series, rank seal, flavour line, description,
	 * stat grid, modifier chips.
	 * @param {gachaItem} item
	 * @param {{onSave?: (item: gachaItem) => void, actions?: boolean, footnote?: string}} options onSave adds a Keep button;
	 *   footnote is a provenance line under the chips;
	 *   either one adds the action row (actions alone gives just Copy)
	 * @returns {HTMLElement}
	 */
	static buildItemCard(item, options = {}) {
		const card = termRenderer.element("article", "result-card item-card")
		const color = termRenderer.rankColor(item.get("rank"))
		card.style.setProperty("--c", color)
		card.dataset.tier = termRenderer.rankTier(item.get("rank"))

		const top = termRenderer.element("div", "rc-top")
		const rank = termRenderer.element("div", "rc-rank")
		rank.appendChild(termRenderer.element("span", "rc-rank-label", "Rank"))
		rank.appendChild(termRenderer.element("strong", "", item.get("rank")))

		const title = termRenderer.element("div", "rc-title")
		const kicker = termRenderer.element("div", "rc-kicker")
		kicker.appendChild(termRenderer.categoryTag(item.get("category")))
		if (item.get("series")) kicker.appendChild(termRenderer.element("span", "rc-series", item.get("series")))
		title.appendChild(kicker)
		title.appendChild(termRenderer.element("h3", "", item.get("name")))
		top.append(title, rank)

		const intro = termRenderer.element("p", "rc-intro", termRenderer.scrollIntro(item))
		const desc = termRenderer.element("p", "rc-desc", item.get("description"))

		const stats = termRenderer.element("div", "stat-grid")
		for (let key of gachaItem.statKeys) {
			const value = item.get(key)
			const stat = termRenderer.element("div", "stat")
			stat.style.setProperty("--rank-color", termRenderer.rankColor(value))
			stat.appendChild(termRenderer.element("span", "k", key))
			stat.appendChild(termRenderer.element("span", "v", value))
			stats.appendChild(stat)
		}

		const mods = termRenderer.element("div", "chips")
		mods.appendChild(termRenderer.chip(`Total ${Number(item.get("stats")).toLocaleString()}`, "accent"))
		if (item.get("gender") && item.get("gender") !== "N/A") mods.appendChild(termRenderer.chip(item.get("gender")))
		if (item.get("growthType") !== "N/A") mods.appendChild(termRenderer.chip(`Growth: ${item.get("growthType")} / ${item.get("growthRate")}`))
		if (item.get("restock") !== "N/A") mods.appendChild(termRenderer.chip(`Restock: ${item.get("restock")}`))
		if (item.get("returnValue") !== "N/A") mods.appendChild(termRenderer.chip(`Return: ${item.get("returnValue")}`))
		if (item.get("gift")) mods.appendChild(termRenderer.chip("Giftable"))
		if (item.get("nsfw")) mods.appendChild(termRenderer.chip("NSFW", "warn"))
		const tags = item.tags.getAllTrue()
		if (tags.length) mods.appendChild(termRenderer.chip(tags.join(" · "), "dim"))

		card.append(top, intro, desc, stats, mods)
		if (options.footnote) card.appendChild(termRenderer.element("p", "rc-foot", options.footnote))
		if (options.onSave || options.actions) card.appendChild(termRenderer.cardActions(item, options.onSave))
		return card
	}

	/**
	 * result card for a curse: severity, title, target/affects chips, description, resolution, and the
	 * keys it pays out as key tokens.
	 * @param {gachaCurse} curse
	 * @param {{onSave?: (curse: gachaCurse) => void, actions?: boolean, footnote?: string}} options
	 * @returns {HTMLElement}
	 */
	static buildCurseCard(curse, options = {}) {
		const card = termRenderer.element("article", "result-card curse-card")
		card.style.setProperty("--c", termRenderer.severityColor(curse))

		const top = termRenderer.element("div", "rc-top")
		const title = termRenderer.element("div", "rc-title")
		const kicker = termRenderer.element("div", "rc-kicker")
		kicker.appendChild(termRenderer.severityBadge(curse))
		if (curse.get("nsfw")) kicker.appendChild(termRenderer.chip("NSFW", "warn"))
		title.appendChild(kicker)
		title.appendChild(termRenderer.element("h3", "", curse.get("name")))
		const chips = termRenderer.element("div", "chips")
		chips.appendChild(termRenderer.chip(`Target: ${curse.get("target")}`))
		chips.appendChild(termRenderer.chip(`Affects: ${curse.get("affects")}`))
		title.appendChild(chips)
		top.appendChild(title)

		const desc = termRenderer.element("p", "rc-desc", curse.get("description"))
		const res = termRenderer.element("div", "rc-block")
		res.appendChild(termRenderer.element("span", "rc-block-label", "Resolution"))
		res.appendChild(termRenderer.element("p", "", curse.get("resolution")))

		const reward = termRenderer.element("div", "rc-block rc-reward")
		reward.appendChild(termRenderer.element("span", "rc-block-label", "Pays out"))
		const keys = termRenderer.element("div", "reward-keys")
		const tickets = curse.rewardTickets()
		if (tickets.length) {
			for (let ticket of tickets) {
				const key = termRenderer.element("span", "reward-key")
				const img = document.createElement("img")
				img.src = termRenderer.tokenUrl(ticket.star)
				img.alt = ""
				key.append(img, termRenderer.element("span", "", `${ticket.n}× ${ticket.star === 8 ? "EX" : ticket.star}★`))
				keys.appendChild(key)
			}
		} else {
			keys.appendChild(termRenderer.rewardChip(curse))
		}
		reward.appendChild(keys)

		card.append(top, desc, res, reward)
		if (options.footnote) card.appendChild(termRenderer.element("p", "rc-foot", options.footnote))
		if (options.onSave || options.actions) card.appendChild(termRenderer.cardActions(curse, options.onSave))
		return card
	}
}
