import { filteringHandler } from "./filteringHandler";
import { gachaBuildsOptionsHandler } from "./gachaBuildsOptionsHandler";
import { gachaCurse } from "./gachaCurse";
import { gachaItem } from "./gachaItem";
import { termRenderer } from "./termRenderer";
import { gachaReveal } from "./gachaReveal";
import { quickstart } from "./quickstart";
import { toast, copyToClipboard } from "./utils";

export { pageHandler }

// rows rendered at most in search results, keeps the DOM sane with ~5600 items
const MAX_SEARCH_ROWS = 500

// theme names the Options dialog offers; anything else falls back to the first one (the Archive look)
const THEMES = ["archive", "luna", "olive", "silver", "classic", "midnight"]

// the three content lights on the item machine -> NSFW options
const CONTENT_MODES = {
	normal: { NSFW: false, NSFWOnly: false },
	pg13: { NSFW: true, NSFWOnly: false },
	r18: { NSFW: true, NSFWOnly: true },
}

/**
 * everything that reads or writes the page. holds the roll histories and search results,
 * drives the machines, tables, tabs, options dialog and quickstart.
 * data questions go to filteringHandler, build/option state to gachaBuildsOptionsHandler.
 */
class pageHandler {

	/**@type {filteringHandler} */
	#filteringHandler

	/**@type {gachaBuildsOptionsHandler} */
	#buildsOptions

	/**@type {quickstart} */
	#quickstart

	/**
	 * @type {{
	 * 	items: gachaItem[],
	 * 	curses: gachaCurse[]
	 * }}
	 */
	#history = {
		items: [],
		curses: []
	}

	/** @type {{ items: gachaItem[], curses: gachaCurse[] }} last search results, kept for sorting */
	#searchResults = {
		items: [],
		curses: []
	}

	/** selected ticket star level, 0 = no ticket */
	#ticket = 0

	/** reveal handles for the roll in flight, so a second click skips */
	#rolling = { items: null, curses: null }

	/**
	 * async build a lot of important async things.
	 * @returns {Promise<pageHandler>} pageHandler promise
	 */
	static async build(){
		const buildsOptionsHandler = new gachaBuildsOptionsHandler()
		const filterHandler = filteringHandler.build(buildsOptionsHandler)

		const page = new pageHandler(await filterHandler, buildsOptionsHandler)
		return page
	}

	/**
	 * DO NOT USE THIS RAW, USE static .build method. need to do some async things.
	 * @param {filteringHandler} filteringHandler
	 * @param {gachaBuildsOptionsHandler} buildsOptionsHandler
	 */
	constructor(filteringHandler, buildsOptionsHandler){
		this.#filteringHandler = filteringHandler
		this.#buildsOptions = buildsOptionsHandler
		this.#quickstart = new quickstart({
			randomCurses: (n) => this.#filteringHandler.getRandomCurses(n),
			randomItemForTicket: (star) => this.#filteringHandler.getRandomItemForTicket(star),
			buildItemCard: (item) => termRenderer.buildItemCard(item, { onSave: (i) => this.saveTerm("items", i) }),
			buildCurseCard: (curse) => termRenderer.buildCurseCard(curse, { onSave: (c) => this.saveTerm("curses", c) }),
			onRolled: (items, curses) => {
				this.#history.items.unshift(...items)
				this.#history.curses.unshift(...curses)
				this.redrawHistoryTables()
			},
			onSaveAll: (items, curses) => {
				this.#buildsOptions.saveTerms("items", items)
				this.#buildsOptions.saveTerms("curses", curses)
				this.redrawAllSaveTables()
				toast(`Kept ${items.length} scrolls and ${curses.length} curses in codex "${this.#buildsOptions.getCurrentBuildKey()}"`)
			},
			toast: toast
		})
	}

	/**
	 * one-time page setup after the data and cookies are in: table headers, options, build labels,
	 * quickstart, clock, and the tab named in the url hash.
	 */
	initPage() {
		for (let table of document.querySelectorAll("table.dataTable")) {
			termRenderer.buildTableHeader(table, table.dataset.kind, table.dataset.extra)
		}
		this.createAllSortButtons()
		this.applyAllOptions()
		this.setTicket(0)
		this.redrawAllSaveTables()
		this.redrawHistoryTables()
		this.#quickstart.init()
		this.#startClock()
		this.changeTabTo(this.#tabFromHash() || "home")
		if (filteringHandler.usingSampleData) toast("data/values.json has not been built yet, showing the sample scrolls", "Sample data")
	}

	// ---------------------------------------------------------------- options dialog

	/**
	 * display the options dialog
	 */
	static openOptions() {
		document.getElementById("optionsMenu").classList.add("open")
		document.getElementById("drawerBackdrop").classList.add("open")
	}

	/**
	 * close the options dialog
	 */
	static closeOptions() {
		document.getElementById("optionsMenu").classList.remove("open")
		document.getElementById("drawerBackdrop").classList.remove("open")
	}

	/**
	 * update option checkboxes/other things, and then apply those changes
	 * should only be used once to initalize page
	 */
	applyAllOptions() {
		this.#initalizeBackgroundImageOption()
		this.applyTheme()
		this.#syncContentControls()
		this.populateBuildSelector();
	}

	/**
	 * put the saved theme on <html data-theme> (style.css has a block per theme) and select it in the dialog.
	 * the base tokens in style.css are the Luna look; every other theme, Archive included, is a block of overrides.
	 * @param {string} [theme] defaults to the saved option
	 */
	applyTheme(theme = this.#buildsOptions.getOption("theme")) {
		if (THEMES.indexOf(theme) === -1) theme = THEMES[0]
		document.documentElement.dataset.theme = theme
		document.getElementById("optionsThemeSelector").value = theme
	}

	/**
	 * the theme <select> in the options dialog
	 * @param {Event} event 
	 */
	themeChangeListener(event) {
		const theme = event.target.value
		this.#buildsOptions.changeOption("theme", theme)
		this.applyTheme(theme)
	}
	/**
	 * update the background image checkbox element
	 * @param {boolean} isOn if it's on or not
	 */
	#initalizeBackgroundImageOption(isOn = this.#buildsOptions.getOption("backgroundImage")){
		document.getElementById("optionsBackgroundToggle").checked = isOn
		this.updateBackgroundImage(isOn)
	}

	/**
	 * update the background image itself. the image is set in style.css, body.no-bg removes it.
	 * @param {boolean} isOn
	 */
	updateBackgroundImage(isOn = this.#buildsOptions.getOption("backgroundImage")) {
		document.body.classList.toggle("no-bg", !isOn)
	}

	backgroundImageOptionChangeListener(event){
		const isOn = event.target.checked
		this.#buildsOptions.changeOption("backgroundImage", isOn)
		this.updateBackgroundImage(isOn)
	}

	/**
	 * which of the three content modes the NSFW options currently describe
	 * @returns {"normal"|"pg13"|"r18"}
	 */
	#contentMode() {
		const nsfw = this.#buildsOptions.getOption("NSFW")
		const nsfwOnly = this.#buildsOptions.getOption("NSFWOnly")
		if (nsfw && nsfwOnly) return "r18"
		if (nsfw) return "pg13"
		return "normal"
	}

	/**
	 * reflect the NSFW options into the dialog checkboxes and the machine lights, then refilter
	 */
	#syncContentControls() {
		const nsfw = this.#buildsOptions.getOption("NSFW")
		const nsfwOnly = this.#buildsOptions.getOption("NSFWOnly")
		document.getElementById("nsfwCheckbox").checked = nsfw
		document.getElementById("nsfwOnlyCheckbox").checked = nsfwOnly
		document.getElementById("nsfwOnlyCheckbox").closest("label").hidden = !nsfw
		const mode = this.#contentMode()
		for (let light of document.querySelectorAll(".hotspot.light")) {
			light.classList.toggle("on", light.dataset.mode === mode)
			light.setAttribute("aria-pressed", light.dataset.mode === mode)
		}
		this.#filteringHandler.updateContentFilter()
		this.#updatePoolCount()
	}

	/**
	 * set the content mode from a machine light
	 * @param {"normal"|"pg13"|"r18"} mode
	 */
	setContentMode(mode) {
		const values = CONTENT_MODES[mode] || CONTENT_MODES.normal
		this.#buildsOptions.changeOptionMultiple({ key: "NSFW", value: values.NSFW }, { key: "NSFWOnly", value: values.NSFWOnly })
		this.#syncContentControls()
	}

	/**
	 * content options change listener (the dialog checkboxes)
	 * @param {Event} event
	 */
	contentOptionsChangeListener(event){
		const nsfw = document.getElementById("nsfwCheckbox").checked
		const nsfwOnly = nsfw && document.getElementById("nsfwOnlyCheckbox").checked
		this.#buildsOptions.changeOptionMultiple({ key: "NSFW", value: nsfw }, { key: "NSFWOnly", value: nsfwOnly })
		this.#syncContentControls()
	}

	// ---------------------------------------------------------------- item machine filters

	/**
	 * called by each category filter checkbox, pass on it's current value.
	 * "All" follows: checked when every category is, unchecked otherwise.
	 * @param {Event} event
	 */
	categoryFilterChangeListener(event){
		this.#filteringHandler.updateCategoryFilter(event.currentTarget.value, event.currentTarget.checked)
		const boxes = Array.from(document.querySelectorAll("#itemsCategoryFilter input")).slice(1)
		document.getElementById("itemsCategoryFilterAll").checked = boxes.every(box => box.checked)
		this.#updatePoolCount()
	}

	/**
	 * called by the all checkbox only. changes everything else.
	 * @param {Event} event
	 */
	categoryFilterAllChangeListener(event){
		const isAll = event.currentTarget.checked
		for(let checkbox of document.querySelectorAll("#itemsCategoryFilter input")){
			checkbox.checked = isAll;
		}
		this.#filteringHandler.resetCategoryFilter(isAll)
		this.#updatePoolCount()
	}

	/**
	 * pick a ticket: filter ranks, show its token in the machine's side panel, mark the popover button
	 * @param {number|string} star 0-8
	 */
	setTicket(star) {
		this.#ticket = parseInt(star) || 0
		this.#filteringHandler.updateRankFilter(this.#ticket)
		const token = document.getElementById("panelToken")
		token.src = termRenderer.tokenUrl(this.#ticket)
		token.alt = this.#ticket ? `${this.#ticket === 8 ? "EX" : this.#ticket} star key` : "No key"
		for (let button of document.querySelectorAll("#starPopover .token-pick")) {
			button.setAttribute("aria-pressed", parseInt(button.dataset.star) === this.#ticket)
		}
		document.getElementById("starPopover").hidden = true
		this.#updatePoolCount()
	}

	/** "N items in the pool" under the machine */
	#updatePoolCount() {
		const count = this.#filteringHandler.getRollPoolSize("items")
		document.getElementById("poolCount").textContent = `${count.toLocaleString()} scrolls within reach`
	}

	/**
	 * open one popover (ticket tokens or categories) under its machine button, closing the other
	 * @param {string} id
	 */
	togglePopover(id) {
		for (let popover of document.querySelectorAll(".machine .popover")) {
			popover.hidden = popover.id === id ? !popover.hidden : true
		}
	}

	closePopovers() {
		for (let popover of document.querySelectorAll(".machine .popover")) popover.hidden = true
	}

	// ---------------------------------------------------------------- builds

	/**
	 * populate the build <selector> element with options.
	 * should be called whenever a build is added or deleted
	 */
	populateBuildSelector() {
		const select = document.getElementById("optionsBuildSelector")
		select.textContent = "" //wipe with textContent to avoid .innerHTML

		const builds = this.#buildsOptions.getOption("buildsArray")
		if (builds.length == 0) {
			console.warn("warning, no builds. something has probably gone wrong.")
			return;
		}
		for (let build of builds) {
			const option = document.createElement("option");
			option.value = build
			option.innerText = build
			select.appendChild(option)
		}

		select.value = this.#buildsOptions.getOption("build")
		this.#updateBuildLabels()
	}

	/** every "Current build: x" label and the Build tab totals */
	#updateBuildLabels() {
		const name = this.#buildsOptions.getCurrentBuildKey()
		for (let label of document.querySelectorAll(".current-build-name")) label.textContent = name
		const totals = document.getElementById("buildTotals")
		if (totals) totals.textContent = `${this.#buildsOptions.getCurrentSavedItems().length} scrolls · ${this.#buildsOptions.getCurrentSavedCurses().length} curses`
	}

	/**
	 * handles input validation on the event and calls createNewBuild()
	 * @param {KeyboardEvent} event
	*/
	createNewBuildEventHandler(event) {
		const value = event.target.value.trim()
		if (event.key != "Enter" || value == "") return;
		event.preventDefault()

		if (!this.#buildsOptions.createNewBuild(value)) {
			toast(`"${value}" is already a codex`)
			return;
		}
		event.target.value = ""
		this.populateBuildSelector()
		this.redrawAllSaveTables()
		toast(`Codex "${value}" created`)
	}

	/**
	 * event handler to get value then call switchBuild()
	 * @param {Event} event
	**/
	switchBuildEventHandler(event) {
		this.#buildsOptions.switchBuild(event.currentTarget.value)
		this.redrawAllSaveTables()
		toast(`Switched to codex "${event.currentTarget.value}"`)
	}

	/**
	 * confirm user wants to delete current build then call deleteBuild
	*/
	deleteCurrentBuildListener(){
		const currentBuild = this.#buildsOptions.getOption("build")
		if (confirm(`Are you sure you want to delete codex "${currentBuild}"?`)) {
			this.#buildsOptions.deleteBuild(currentBuild)
			this.populateBuildSelector()
			this.redrawAllSaveTables()
			toast(`Deleted codex "${currentBuild}"`)
		}
	}

	/**
	 * save one entry to the current build, redraw, confirm
	 * @param {"items"|"curses"} term
	 * @param {gachaItem|gachaCurse} value
	 */
	saveTerm(term, value) {
		if (!value) return
		this.#buildsOptions.saveTerm(term, value)
		this.redrawAllSaveTables(term)
		toast(`Kept "${value.get("name")}" in codex "${this.#buildsOptions.getCurrentBuildKey()}"`)
	}

	/** save the most recent roll of a kind (the machine's save buttons) */
	saveLatest(term){
		const latest = this.#history[term][0]
		if (!latest) { toast(term === "items" ? "Draw a scroll first" : "Read a curse first"); return }
		this.saveTerm(term, latest)
	}

	/** copy the most recent roll of a kind */
	copyLatest(term) {
		const latest = this.#history[term][0]
		if (!latest) { toast("Draw a scroll first"); return }
		copyToClipboard(latest.toString(), term === "items" ? "Item" : "Curse")
	}

	// ---------------------------------------------------------------- tabs

	/** "#items" -> "items" when such a tab exists, otherwise null */
	#tabFromHash() {
		const name = location.hash.replace("#", "")
		const element = name && document.getElementById(name)
		return element && element.classList.contains("tabcontent") ? name : null
	}

	/**
	 * show one tab window, press its taskbar button, keep the url hash in sync
	 * @param {string} targetTabID
	 */
	changeTabTo(targetTabID) {
		const newTab = document.getElementById(targetTabID)
		if (!newTab) return
		for (let tab of document.querySelectorAll(".tabcontent")) {
			tab.classList.toggle("active", tab === newTab)
		}
		for (let button of document.querySelectorAll("#taskbar [data-tab]")) {
			button.classList.toggle("active", button.dataset.tab === targetTabID)
		}
		if (location.hash !== "#" + targetTabID) history.replaceState(null, "", "#" + targetTabID)
		this.closePopovers()
		window.scrollTo({ top: 0 })
	}

	/** react to the user editing the hash or using the back button */
	hashChangeListener() {
		const name = this.#tabFromHash()
		if (name) this.changeTabTo(name)
	}

	// ---------------------------------------------------------------- tables

	/**
	 * redraw a table with a button on each row
	 * @param {HTMLTableElement} table
	 * @param {(gachaItem|gachaCurse)[]} dataArray
	 * @param {string} buttonText
	 * @param {string} buttonClass
	 * @param {(index: number) => void} onClick
	 * @param {number} [maxRows]
	 */
	#redrawTableWithButton(table, dataArray, buttonText, buttonClass, onClick, maxRows) {
		const rows = []
		const limit = maxRows ? Math.min(maxRows, dataArray.length) : dataArray.length

		for(let i = 0; i < limit; i++){
			const row = termRenderer.createRow(dataArray[i])
			const button = document.createElement("button")
			button.className = "xp-button small " + buttonClass
			button.textContent = buttonText
			button.addEventListener("click", () => onClick(i))
			row.appendChild(document.createElement("td")).appendChild(button)
			rows.push(row)
		}

		this.#redrawTableBody(table, rows)
		this.#updateCount(table.id, dataArray.length)
		this.#updateTruncationNote(table, limit, dataArray.length)
	}

	/** the row-count badge(s) in a table's group header */
	#updateCount(tableId, count) {
		for (let badge of document.querySelectorAll(`[data-count-for="${tableId}"]`)) badge.textContent = count.toLocaleString()
	}

	/** "Showing the first N of M results" under a capped table */
	#updateTruncationNote(table, shown, total) {
		const group = table.closest(".table-group")
		if (!group) return
		let note = group.querySelector(".table-note")
		if (total > shown) {
			if (!note) {
				note = document.createElement("div")
				note.className = "table-note"
				group.appendChild(note)
			}
			note.textContent = `Showing the first ${shown.toLocaleString()} of ${total.toLocaleString()} results. Narrow your search to see the rest.`
		} else if (note) {
			note.remove()
		}
	}

	/**
	 *
	 * @param {HTMLTableElement} table table to draw to
	 * @param {HTMLTableRowElement[]} rows what to draw in it
	 */
	#redrawTableBody(table, rows){
		const tbody = table.querySelector(`tbody`)
		tbody.textContent = ""

		// placeholder row so an empty table still says something
		if (rows.length === 0) {
			const row = document.createElement("tr")
			row.className = "empty-row"
			const cell = document.createElement("td")
			cell.colSpan = table.querySelectorAll("thead th").length || 1
			cell.textContent = "Nothing here yet."
			row.appendChild(cell)
			tbody.appendChild(row)
		}
		for(let row of rows){
			tbody.appendChild(row)
		}
	}

	/** both roll history tables */
	redrawHistoryTables() {
		for (let term of ["items", "curses"]) {
			const table = document.querySelector(`.historyTable.${term}Table`)
			this.#redrawTableWithButton(table, this.#history[term], term === "items" ? "Keep" : "Bind", "", (i) => this.saveTerm(term, this.#history[term][i]))
		}
	}

	/**
	 * redraw all save tables, or just items or curses tables. determined by term
	 * any nonstandard term will be treated the same as no term at all
	 * @param {string=} term
	 */
	redrawAllSaveTables(term){
		const terms = (term == "items" || term == "curses") ? [term] : ["items", "curses"]
		for (let t of terms) {
			const saved = this.#buildsOptions.getCurrentSaved(t)
			for(let table of document.querySelectorAll(`.saveTable.${t}Table`)){
				this.#redrawTableWithButton(table, saved, "Remove", "danger", (i) => {
					this.#buildsOptions.removeCurrentSaved(t, i)
					this.redrawAllSaveTables(t)
				})
			}
		}
		this.#updateBuildLabels()
	}

	/** a search results table from the stored results */
	redrawSearchTable(term) {
		const table = document.getElementById(term === "items" ? "searchItemsTable" : "searchCursesTable")
		this.#redrawTableWithButton(table, this.#searchResults[term], term === "items" ? "Keep" : "Bind", "", (i) => this.saveTerm(term, this.#searchResults[term][i]), MAX_SEARCH_ROWS)
	}

	/**
	 * run a search from its form: three plain text fields plus the advanced query
	 * @param {HTMLFormElement} form
	 * @param {"items"|"curses"} term
	 */
	searchSubmitListener(form, term) {
		const inputs = form.querySelectorAll("input[type=text]")
		const basic = {}
		for (let input of inputs) {
			if (input.dataset.key) basic[input.dataset.key] = input.value
		}
		const advanced = form.querySelector(".advancedSearch").value
		try {
			this.#searchResults[term] = this.#filteringHandler.search({ basic, advanced }, term)
		} catch (error) {
			if (error instanceof RangeError) { toast(error.message, "Search"); return }
			throw error
		}
		this.redrawSearchTable(term)
	}

	/**
	 * compare function for sorting a column. ranks sort by strength, stats numerically,
	 * booleans false-first, everything else as case-insensitive text.
	 * @param {string} key
	 * @param {boolean} ascending
	 */
	static compareFunctionCreator(key, ascending) {
		const direction = ascending ? 1 : -1
		const isRank = gachaItem.statKeys.indexOf(key) !== -1 || key === "rank"
		return function (a, b) {
			let x = a.get(key), y = b.get(key)
			if (isRank) { x = termRenderer.rankToNumber(x); y = termRenderer.rankToNumber(y) }
			else if (typeof x === "string" && typeof y === "string") { x = x.toLowerCase(); y = y.toLowerCase() }
			if (x < y) return -direction
			if (x > y) return direction
			return 0
		}
	}

	/**
	 * clicking a column header sorts that table, clicking again flips the direction.
	 * each table id maps to the array behind it and how to redraw it.
	 */
	createAllSortButtons() {
		const registry = {
			itemRollHistoryTable: { array: () => this.#history.items, redraw: () => this.redrawHistoryTables() },
			curseRollHistoryTable: { array: () => this.#history.curses, redraw: () => this.redrawHistoryTables() },
			saveTable: { saved: "items" },
			cursesSaveTable: { saved: "curses" },
			buildItemsTable: { saved: "items" },
			buildCursesTable: { saved: "curses" },
			searchItemsTable: { array: () => this.#searchResults.items, redraw: () => this.redrawSearchTable("items") },
			searchCursesTable: { array: () => this.#searchResults.curses, redraw: () => this.redrawSearchTable("curses") },
		}
		for (let tableId in registry) {
			const table = document.getElementById(tableId)
			if (!table) continue
			const entry = registry[tableId]
			for (let th of table.querySelectorAll("th.sortable")) {
				th.addEventListener("click", () => {
					const ascending = !th.classList.contains("sorted-asc")
					for (let other of table.querySelectorAll("th.sortable")) other.classList.remove("sorted-asc", "sorted-desc")
					th.classList.add(ascending ? "sorted-asc" : "sorted-desc")
					const compare = pageHandler.compareFunctionCreator(th.dataset.key, ascending)
					if (entry.saved) {
						this.#buildsOptions.sortCurrentSaved(entry.saved, compare)
						this.redrawAllSaveTables(entry.saved)
					} else {
						entry.array().sort(compare)
						entry.redraw()
					}
				})
			}
		}
	}

	/**
	 * export current build to txt file
	 */
	exportSaved() {
		const build = this.#buildsOptions.getCurrentBuildKey()
		let text = `<CODEX: ${build}>\n\n<SCROLLS>\n\n`;

		for (let item of this.#buildsOptions.getCurrentSavedItems()) {
			text += `${item}\n\n`;
		}

		text += "\n<CURSES>\n\n";
		for (let curse of this.#buildsOptions.getCurrentSavedCurses()) {
			text += `${curse}\n\n`;
		}

		const link = document.createElement("a");
		const file = new Blob([text], { type: 'text/plain' });
		link.href = URL.createObjectURL(file)
		link.download = `Infinite Archive - ${build}.txt`
		link.click();
		URL.revokeObjectURL(link.href);
	}

	// ---------------------------------------------------------------- machines

	/**
	 * roll on a machine: pick a result, play its reveal, record it in the history.
	 * a click while a roll is playing skips to the end.
	 * @param {"items"|"curses"} term
	 */
	roll(term){
		if (this.#rolling[term]) { this.#rolling[term].skip(); return }

		const result = this.#filteringHandler.getRandomTerm(term)
		const machine = document.getElementById(term === "items" ? "itemsMachine" : "cursesMachine")
		if (!result) {
			machine.classList.add("shake-no")
			setTimeout(() => machine.classList.remove("shake-no"), 400)
			toast(term === "items" ? "No scroll within reach. Check your key, shelves, and content settings." : "No curses match your content settings.", "Nothing to draw")
			return
		}
		this.#history[term].unshift(result)
		this.closePopovers()

		const finish = () => {
			this.#rolling[term] = null
			machine.classList.remove("rolling")
			this.redrawHistoryTables()
		}
		machine.classList.add("rolling")

		if (term === "items") {
			const screen = document.getElementById("itemScreen")
			const ball = document.getElementById("panelBall")
			ball.hidden = true
			this.#rolling.items = gachaReveal.screenRoll({
				screen: screen,
				reel: document.getElementById("itemReel"),
				stage: document.getElementById("itemStage"),
				burst: document.getElementById("itemBurst"),
				cardSlot: document.getElementById("itemCardSlot"),
				names: this.#reelNames(),
				card: termRenderer.buildItemCard(result, { compact: true }),
				color: termRenderer.rankColor(result.get("rank")),
				tier: termRenderer.rankTier(result.get("rank")),
				onOpen: () => {
					// the side panel shows the ball of the category that came out
					ball.src = termRenderer.ballUrl(result.get("category")) || ""
					ball.alt = result.get("category")
					ball.hidden = !ball.src
					finish()
				}
			})
		} else {
			this.#rolling.curses = gachaReveal.plateReveal({
				plate: document.getElementById("cursePlate"),
				content: termRenderer.buildCursePlate(result),
				burst: document.getElementById("curseBurst"),
				onOpen: finish
			})
		}
	}

	/** a handful of random names from the current pool for the screen reel */
	#reelNames() {
		const names = []
		for (let i = 0; i < 24; i++) {
			const item = this.#filteringHandler.getRandomItem()
			if (item) names.push(item.get("name"))
		}
		return names
	}

	// ---------------------------------------------------------------- taskbar clock

	/** the tray clock, because a taskbar without one looks wrong */
	#startClock() {
		const clock = document.getElementById("clock")
		if (!clock) return
		const update = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }
		update()
		setInterval(update, 30000)
	}
}
