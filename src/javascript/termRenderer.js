import { gachaItem } from "./gachaItem.js"
import { gachaCurse } from "./gachaCurse.js"
import { filteringHandler } from "./filteringHandler.js"
import { copyToClipboard } from "./utils.js"

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
 * result cards, and the plate shown on the curse machine.
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
		return termRenderer.element("span", "sev-badge sev-" + curse.severity(), curse.get("level"))
	}

	/** reward pill for curses */
	static rewardChip(curse) {
		return termRenderer.element("span", "reward-chip", curse.get("reward"))
	}

	static chip(text, extraClass) {
		return termRenderer.element("span", "chip" + (extraClass ? " " + extraClass : ""), text)
	}

	// ---------------------------------------------------------------- tables

	/**
	 * build thead/tbody for a table from the term's columns.
	 * headers get data-key so pageHandler can sort on click.
	 * @param {HTMLTableElement} table
	 * @param {"items"|"curses"} kind
	 * @param {string} [extraColumn] trailing column for a button, e.g. "Save"
	 */
	static buildTableHeader(table, kind, extraColumn) {
		const columns = kind === "curses" ? gachaCurse.columns : gachaItem.columns
		const thead = document.createElement("thead")
		const row = document.createElement("tr")
		for (let column of columns) {
			const th = termRenderer.element("th", "sortable", column.label)
			th.dataset.key = column.key
			row.appendChild(th)
		}
		if (extraColumn) row.appendChild(termRenderer.element("th", "", extraColumn))
		thead.appendChild(row)
		table.textContent = ""
		table.append(thead, document.createElement("tbody"))
	}

	/**
	 * a table row for an item or curse. rank, stat, boolean and severity columns get badges,
	 * long text columns get wrapping classes, and the name cell copies the entry on click.
	 * @param {gachaItem|gachaCurse} term
	 * @returns {HTMLTableRowElement}
	 */
	static createRow(term) {
		const row = document.createElement("tr")
		const isItem = term instanceof gachaItem

		for (let key of term.keys()) {
			const value = term.get(key)
			let cell
			if (isItem) {
				if (key === "name") cell = termRenderer.cell(value, "cell-name")
				else if (key === "series") cell = termRenderer.cell(value, "cell-text")
				else if (key === "description") cell = termRenderer.cell(value, "cell-desc")
				else if (gachaItem.statKeys.indexOf(key) !== -1) cell = termRenderer.cell(termRenderer.statLetter(value))
				else if (key === "stats") cell = termRenderer.cell(Number(value).toLocaleString(), "cell-num")
				else if (key === "rank") cell = termRenderer.cell(termRenderer.rankBadge(value))
				else if (key === "gift" || key === "nsfw") cell = termRenderer.cell(termRenderer.boolBadge(value))
				else cell = termRenderer.cell(value)
			} else {
				if (key === "name") cell = termRenderer.cell(value, "cell-name")
				else if (key === "description" || key === "resolution") cell = termRenderer.cell(value, "cell-desc")
				else if (key === "level") cell = termRenderer.cell(termRenderer.severityBadge(term))
				else if (key === "nsfw") cell = termRenderer.cell(termRenderer.boolBadge(value))
				else if (key === "reward") cell = termRenderer.cell(termRenderer.rewardChip(term))
				else cell = termRenderer.cell(value)
			}
			row.appendChild(cell)
		}

		const nameCell = row.firstElementChild
		nameCell.classList.add("copy-name")
		nameCell.title = "Click to copy"
		nameCell.addEventListener("click", () => {
			copyToClipboard(term.toString(), isItem ? "Item" : "Curse")
			nameCell.classList.add("copied")
			setTimeout(() => nameCell.classList.remove("copied"), 1200)
		})
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

	// ---------------------------------------------------------------- cards

	/**
	 * "Keep in codex" + "Copy" row at the bottom of a card
	 * @param {gachaItem|gachaCurse} term
	 * @param {(term) => void} onSave
	 */
	static cardActions(term, onSave) {
		const actions = termRenderer.element("div", "rc-actions")
		const save = termRenderer.element("button", "xp-button default", "Keep in codex")
		save.addEventListener("click", () => {
			onSave(term)
			save.textContent = "Kept"
			save.disabled = true
		})
		const copy = termRenderer.element("button", "xp-button right", "Copy")
		copy.addEventListener("click", () => copyToClipboard(term.toString(), term instanceof gachaItem ? "Item" : "Curse"))
		actions.append(save, copy)
		return actions
	}

	/**
	 * result card for an item: rank square, title, chips, description, stat grid, modifier chips.
	 * @param {gachaItem} item
	 * @param {{onSave?: (item: gachaItem) => void, compact?: boolean}} options onSave adds the action row; compact drops the stat grid (machine screen)
	 * @returns {HTMLElement}
	 */
	static buildItemCard(item, options = {}) {
		const card = termRenderer.element("article", "result-card" + (options.compact ? " compact" : ""))
		const color = termRenderer.rankColor(item.get("rank"))
		card.style.setProperty("--c", color)

		const top = termRenderer.element("div", "rc-top")
		const rank = termRenderer.element("div", "rc-rank", item.get("rank"))
		if (["F", "A", "SSS"].indexOf(String(item.get("rank")).toUpperCase()) !== -1) rank.classList.add("light")

		const title = termRenderer.element("div", "rc-title")
		title.appendChild(termRenderer.element("h3", "", item.get("name")))
		title.appendChild(termRenderer.element("div", "rc-series", item.get("series")))
		const chips = termRenderer.element("div", "chips")
		chips.appendChild(termRenderer.chip(item.get("category"), "accent"))
		if (item.get("gender") && item.get("gender") !== "N/A") chips.appendChild(termRenderer.chip(item.get("gender")))
		if (item.get("nsfw")) chips.appendChild(termRenderer.chip("NSFW", "warn"))
		const tags = item.tags.getAllTrue()
		if (tags.length) chips.appendChild(termRenderer.chip(tags.join(" · "), "dim"))
		title.appendChild(chips)
		top.append(rank, title)

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
		mods.appendChild(termRenderer.chip(`Stats ${item.get("stats")}`, "cyan"))
		if (item.get("growthType") !== "N/A") mods.appendChild(termRenderer.chip(`Growth: ${item.get("growthType")} / ${item.get("growthRate")}`))
		if (item.get("restock") !== "N/A") mods.appendChild(termRenderer.chip(`Restock: ${item.get("restock")}`))
		if (item.get("returnValue") !== "N/A") mods.appendChild(termRenderer.chip(`Return: ${item.get("returnValue")}`))
		if (item.get("gift")) mods.appendChild(termRenderer.chip("Giftable"))

		card.append(top, intro, desc, stats, mods)
		if (options.onSave) card.appendChild(termRenderer.cardActions(item, options.onSave))
		return card
	}

	/**
	 * result card for a curse: severity square, title, target/affects chips, description, resolution, reward.
	 * @param {gachaCurse} curse
	 * @param {{onSave?: (curse: gachaCurse) => void}} options
	 * @returns {HTMLElement}
	 */
	static buildCurseCard(curse, options = {}) {
		const card = termRenderer.element("article", "result-card")
		card.style.setProperty("--c", "#A855F7")

		const top = termRenderer.element("div", "rc-top")
		const sev = termRenderer.element("div", "rc-rank sev sev-" + curse.severity(), curse.get("level"))
		const title = termRenderer.element("div", "rc-title")
		title.appendChild(termRenderer.element("h3", "", curse.get("name")))
		const chips = termRenderer.element("div", "chips")
		chips.appendChild(termRenderer.chip(`Target: ${curse.get("target")}`, "accent"))
		chips.appendChild(termRenderer.chip(`Affects: ${curse.get("affects")}`))
		if (curse.get("nsfw")) chips.appendChild(termRenderer.chip("NSFW", "warn"))
		title.appendChild(chips)
		top.append(sev, title)

		const desc = termRenderer.element("p", "rc-desc", curse.get("description"))
		const res = termRenderer.element("p", "rc-sub")
		res.appendChild(termRenderer.element("strong", "", "Resolution: "))
		res.appendChild(document.createTextNode(curse.get("resolution")))
		const reward = termRenderer.element("p", "rc-sub")
		reward.appendChild(termRenderer.element("strong", "", "Reward: "))
		reward.appendChild(termRenderer.rewardChip(curse))

		card.append(top, desc, res, reward)
		if (options.onSave) card.appendChild(termRenderer.cardActions(curse, options.onSave))
		return card
	}

	/**
	 * the text that fills the painted plate on the curse machine, laid out like the artist's mockup:
	 * name | severity | target | affects, then description, resolution, and a reward column with the ticket token.
	 * @param {gachaCurse} curse
	 * @returns {HTMLElement}
	 */
	static buildCursePlate(curse) {
		const plate = termRenderer.element("div", "plate-content")
		const head = termRenderer.element("div", "plate-head")
		head.appendChild(termRenderer.element("span", "plate-name", curse.get("name")))
		head.appendChild(termRenderer.element("span", "", `Severity: ${curse.get("level")}`))
		head.appendChild(termRenderer.element("span", "", `Target: ${curse.get("target")}`))
		head.appendChild(termRenderer.element("span", "", `Affects: ${curse.get("affects")}`))

		const body = termRenderer.element("div", "plate-body")
		const text = termRenderer.element("div", "plate-text")
		text.appendChild(termRenderer.element("p", "plate-desc", curse.get("description")))
		const res = termRenderer.element("p", "plate-res")
		res.appendChild(termRenderer.element("strong", "", "Resolution: "))
		res.appendChild(document.createTextNode(curse.get("resolution")))
		text.appendChild(res)

		const side = termRenderer.element("div", "plate-side")
		side.appendChild(termRenderer.element("strong", "", "Reward:"))
		const tickets = curse.rewardTickets()
		if (tickets.length) {
			for (let ticket of tickets) {
				const line = termRenderer.element("div", "plate-reward")
				line.appendChild(termRenderer.element("span", "", `${ticket.n}×`))
				const img = document.createElement("img")
				img.src = termRenderer.tokenUrl(ticket.star)
				img.alt = `${ticket.star === 8 ? "EX" : ticket.star} star key`
				line.appendChild(img)
				side.appendChild(line)
			}
		} else {
			side.appendChild(termRenderer.element("div", "plate-reward", curse.get("reward")))
		}
		side.appendChild(termRenderer.element("span", "", `NSFW: ${curse.get("nsfw") ? "Yes" : "No"}`))
		body.append(text, side)
		plate.append(head, body)
		return plate
	}
}
