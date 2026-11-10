import { filteringHandler } from "./filteringHandler";
import { gachaBuildsOptionsHandler } from "./gachaBuildsOptionsHandler";
import { gachaCurse } from "./gachaCurse";
import { gachaItem } from "./gachaItem";
import { termRenderer } from "./termRenderer";
import { gachaReveal } from "./gachaReveal";
import { quickstart } from "./quickstart";
import { toast } from "./utils";

export { pageHandler }

// rows rendered at most in search results, keeps the DOM sane with ~5600 items
const MAX_SEARCH_ROWS = 500

// localStorage key for the character sheets (one per codex); cookies are too small for a portrait
const PROFILES_KEY = "infiniteArchive.profiles"
// portraits are scaled down to this many pixels on the long side before storing
const PORTRAIT_MAX = 360

// theme choices in Options. "system" follows prefers-color-scheme; anything else saved by an older
// version of the site (the XP themes) falls back to system, except midnight which was the dark one.
const THEMES = ["system", "light", "dark"]

// content modes -> NSFW options
const CONTENT_MODES = {
	normal: { NSFW: false, NSFWOnly: false },
	pg13: { NSFW: true, NSFWOnly: false },
	r18: { NSFW: true, NSFWOnly: true },
}

// key names for the Draw panel label, by star level
const KEY_NAMES = ["Any shelf", "1★ Iron", "2★ Silver", "3★ Blue steel", "4★ Gold", "5★ Platinum", "6★ Crystal", "7★ Star-iron", "EX★ The gap"]

// hashes from the old eight-tab layout -> [page, draw mode]
const TAB_ALIASES = {
	items: ["draw", "items"],
	curses: ["draw", "curses"],
	about: ["guide"],
	starts: ["guide"],
}

/**
 * everything that reads or writes the page. holds the roll histories and search results,
 * drives the draw stages, tables, pages, dialogs and quickstart.
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

	/** which half of the Draw page is showing */
	#drawMode = "items"

	/** reveal handles for the roll in flight, so a second click skips */
	#rolling = { items: null, curses: null }

	/**
	 * character sheets by codex name: { name, world, location, notes, portrait (data url) }
	 * @type {Object<string, object>}
	 */
	#profiles = pageHandler.#loadProfiles()

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
	 * quickstart, and the page named in the url hash.
	 */
	initPage() {
		for (let table of document.querySelectorAll("table.dataTable")) {
			termRenderer.buildTableHeader(table, table.dataset.kind, table.dataset.extra, table.dataset.columns === "compact")
		}
		this.createAllSortButtons()
		this.applyAllOptions()
		this.setTicket(0)
		this.setDrawMode("items")
		this.redrawAllSaveTables()
		this.redrawHistoryTables()
		this.#quickstart.init()
		this.loadProfile()
		this.changeTabTo(location.hash.replace("#", "") || "home")
		if (filteringHandler.usingSampleData) toast("data/values.json has not been built yet, showing the sample scrolls", "Sample data")
	}

	// ---------------------------------------------------------------- dialogs

	/** display the options dialog */
	static openOptions() {
		const dialog = document.getElementById("optionsMenu")
		if (!dialog.open) dialog.showModal()
	}

	/** close the options dialog */
	static closeOptions() {
		const dialog = document.getElementById("optionsMenu")
		if (dialog.open) dialog.close()
	}

	/**
	 * show the full card for one entry in the detail dialog
	 * @param {gachaItem|gachaCurse} term
	 * @param {(term) => void} [onSave] adds a Keep / Bind button
	 */
	showDetails(term, onSave) {
		const options = { onSave, actions: true }
		const card = term instanceof gachaItem ? termRenderer.buildItemCard(term, options) : termRenderer.buildCurseCard(term, options)
		document.getElementById("detailSlot").replaceChildren(card)
		const dialog = document.getElementById("detailDialog")
		if (!dialog.open) dialog.showModal()
	}

	// ---------------------------------------------------------------- options

	/**
	 * update option controls, and then apply those changes
	 * should only be used once to initalize page
	 */
	applyAllOptions() {
		this.#initalizeBackgroundImageOption()
		this.applyTheme()
		this.#syncContentControls()
		this.populateBuildSelector();
	}

	/**
	 * put the theme on <html data-theme> ("light"/"dark"; none for system) and mark it in Options.
	 * @param {string} [theme] defaults to the saved option
	 */
	applyTheme(theme = this.#buildsOptions.getOption("theme")) {
		if (theme === "midnight") theme = "dark"
		if (THEMES.indexOf(theme) === -1) theme = "system"
		if (theme === "system") delete document.documentElement.dataset.theme
		else document.documentElement.dataset.theme = theme
		for (let button of document.querySelectorAll("[data-theme-choice]")) {
			button.setAttribute("aria-pressed", button.dataset.themeChoice === theme)
		}
	}

	/**
	 * a theme was picked in Options
	 * @param {string} theme "system" | "light" | "dark"
	 */
	setTheme(theme) {
		this.#buildsOptions.changeOption("theme", theme)
		this.applyTheme(theme)
	}

	/** the header button: flip whatever is showing now */
	toggleTheme() {
		const explicit = document.documentElement.dataset.theme
		const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
		const isDark = explicit ? explicit === "dark" : systemDark
		this.setTheme(isDark ? "light" : "dark")
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
	 * update the background itself. the starfield is drawn in style.css, body.no-bg removes it.
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
	 * reflect the NSFW options into every content switch (Options and the Draw panel), then refilter
	 */
	#syncContentControls() {
		const mode = this.#contentMode()
		for (let button of document.querySelectorAll("[data-content-mode]")) {
			button.setAttribute("aria-pressed", button.dataset.contentMode === mode)
		}
		this.#filteringHandler.updateContentFilter()
		this.#updatePoolCount()
	}

	/**
	 * set the content mode from one of the switches
	 * @param {"normal"|"pg13"|"r18"} mode
	 */
	setContentMode(mode) {
		const values = CONTENT_MODES[mode] || CONTENT_MODES.normal
		this.#buildsOptions.changeOptionMultiple({ key: "NSFW", value: values.NSFW }, { key: "NSFWOnly", value: values.NSFWOnly })
		this.#syncContentControls()
	}

	// ---------------------------------------------------------------- draw panel

	/**
	 * show the scroll or the curse half of the Draw page
	 * @param {"items"|"curses"} mode
	 */
	setDrawMode(mode) {
		this.#drawMode = mode === "curses" ? "curses" : "items"
		document.getElementById("drawLayout").dataset.mode = this.#drawMode
		for (let button of document.querySelectorAll("[data-draw-mode]")) {
			button.setAttribute("aria-pressed", button.dataset.drawMode === this.#drawMode)
		}
		this.#updatePoolCount()
	}

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
	 * pick a key: filter ranks, mark its button, name it in the panel label
	 * @param {number|string} star 0-8
	 */
	setTicket(star) {
		this.#ticket = parseInt(star) || 0
		this.#filteringHandler.updateRankFilter(this.#ticket)
		for (let button of document.querySelectorAll(".key-pick")) {
			button.setAttribute("aria-pressed", parseInt(button.dataset.star) === this.#ticket)
		}
		document.getElementById("keyName").textContent = KEY_NAMES[this.#ticket] || KEY_NAMES[0]
		this.#updatePoolCount()
	}

	/** "N scrolls within reach" / "N curses in the tome" above the draw button */
	#updatePoolCount() {
		const element = document.getElementById("poolCount")
		if (!element) return
		const count = this.#filteringHandler.getRollPoolSize(this.#drawMode)
		element.textContent = this.#drawMode === "curses"
			? `${count.toLocaleString()} curses in the tome`
			: `${count.toLocaleString()} scrolls within reach`
		element.classList.toggle("empty", count === 0)
	}

	// ---------------------------------------------------------------- builds

	/**
	 * populate the codex <select> with options.
	 * should be called whenever a build is added or deleted
	 */
	populateBuildSelector() {
		const select = document.getElementById("codexSelector")
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

	/** every current-codex label and the Codex page totals */
	#updateBuildLabels() {
		const name = this.#buildsOptions.getCurrentBuildKey()
		for (let label of document.querySelectorAll(".current-build-name")) label.textContent = name
		const totals = document.getElementById("buildTotals")
		if (totals) totals.textContent = `${this.#buildsOptions.getCurrentSavedItems().length} scrolls · ${this.#buildsOptions.getCurrentSavedCurses().length} curses`
		this.loadProfile()
	}

	// ---------------------------------------------------------------- character sheet

	/** read the sheets from localStorage; an unreadable store starts empty */
	static #loadProfiles() {
		try {
			return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {}
		} catch (error) {
			return {}
		}
	}

	#saveProfiles() {
		try {
			localStorage.setItem(PROFILES_KEY, JSON.stringify(this.#profiles))
			const note = document.getElementById("profileSaved")
			if (note) {
				note.textContent = "Saved"
				note.classList.add("show")
				clearTimeout(this.#savedTimer)
				this.#savedTimer = setTimeout(() => note.classList.remove("show"), 1200)
			}
		} catch (error) {
			toast("Could not save the character sheet. The portrait may be too large for this browser.", "Codex")
		}
	}
	#savedTimer

	/** the sheet for the current codex, created empty on first use */
	#profile() {
		const key = this.#buildsOptions.getCurrentBuildKey()
		if (!this.#profiles[key]) this.#profiles[key] = { name: "", world: "", location: "", notes: "", portrait: "" }
		return this.#profiles[key]
	}

	/** fill the sheet form from the current codex's profile */
	loadProfile() {
		const profile = this.#profile()
		for (let field of document.querySelectorAll("[data-profile]")) {
			field.value = profile[field.dataset.profile] || ""
		}
		this.#renderPortrait()
	}

	/**
	 * a sheet field changed
	 * @param {Event} event
	 */
	profileFieldListener(event) {
		this.#profile()[event.target.dataset.profile] = event.target.value
		this.#saveProfiles()
	}

	#renderPortrait() {
		const image = document.getElementById("portraitImage")
		const empty = document.getElementById("portraitEmpty")
		const portrait = this.#profile().portrait
		image.src = portrait || ""
		image.hidden = !portrait
		empty.hidden = !!portrait
	}

	/**
	 * a portrait file was chosen: scale it down on a canvas and keep it as a data url
	 * @param {File} file
	 */
	portraitChangeListener(file) {
		if (!file || !file.type.startsWith("image/")) return
		const reader = new FileReader()
		reader.onload = () => {
			const img = new Image()
			img.onload = () => {
				const scale = Math.min(1, PORTRAIT_MAX / Math.max(img.width, img.height))
				const canvas = document.createElement("canvas")
				canvas.width = Math.round(img.width * scale)
				canvas.height = Math.round(img.height * scale)
				canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height)
				this.#profile().portrait = canvas.toDataURL("image/jpeg", 0.85)
				this.#saveProfiles()
				this.#renderPortrait()
			}
			img.src = reader.result
		}
		reader.readAsDataURL(file)
	}

	portraitClear() {
		this.#profile().portrait = ""
		this.#saveProfiles()
		this.#renderPortrait()
	}

	/**
	 * create a codex from the name field and switch to it
	 * @param {HTMLInputElement} input
	 */
	createNewBuild(input) {
		const value = input.value.trim()
		if (value == "") { input.focus(); return }

		if (!this.#buildsOptions.createNewBuild(value)) {
			toast(`"${value}" is already a codex`)
			return;
		}
		input.value = ""
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
		if (confirm(`Delete codex "${currentBuild}" and everything kept in it?`)) {
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
		toast(`${term === "items" ? "Kept" : "Bound"} "${value.get("name")}" in codex "${this.#buildsOptions.getCurrentBuildKey()}"`)
	}

	// ---------------------------------------------------------------- pages

	/**
	 * "draw" -> ["draw"], "curses" -> ["draw", "curses"]; null when nothing matches
	 * @param {string} name
	 * @returns {string[]|null}
	 */
	#resolveTab(name) {
		if (TAB_ALIASES[name]) return TAB_ALIASES[name]
		const element = name && document.getElementById(name)
		return element && element.classList.contains("tabcontent") ? [name] : null
	}

	/**
	 * show one page, mark its nav button, keep the url hash in sync.
	 * accepts the old tab names too (#items, #curses, #about, #starts).
	 * @param {string} target
	 */
	changeTabTo(target) {
		const resolved = this.#resolveTab(target)
		if (!resolved) return
		const [pageId, drawMode] = resolved
		const newTab = document.getElementById(pageId)
		for (let tab of document.querySelectorAll(".tabcontent")) {
			tab.classList.toggle("active", tab === newTab)
		}
		for (let button of document.querySelectorAll("#nav [data-tab]")) {
			button.classList.toggle("active", button.dataset.tab === pageId)
			if (button.dataset.tab === pageId) button.setAttribute("aria-current", "page")
			else button.removeAttribute("aria-current")
		}
		if (drawMode) this.setDrawMode(drawMode)
		if (location.hash !== "#" + pageId) history.replaceState(null, "", "#" + pageId)
		window.scrollTo({ top: 0 })
	}

	/** react to the user editing the hash or using the back button */
	hashChangeListener() {
		const name = location.hash.replace("#", "")
		if (this.#resolveTab(name)) this.changeTabTo(name)
	}

	// ---------------------------------------------------------------- tables

	/**
	 * redraw a table with a button on each row; clicking a row opens the entry in the detail dialog
	 * @param {HTMLTableElement} table
	 * @param {(gachaItem|gachaCurse)[]} dataArray
	 * @param {string} buttonText
	 * @param {string} buttonClass
	 * @param {(index: number) => void} onClick
	 * @param {{maxRows?: number, detailSave?: (index: number) => void}} [options] detailSave puts a Keep / Bind button in the detail card
	 */
	#redrawTableWithButton(table, dataArray, buttonText, buttonClass, onClick, options = {}) {
		const rows = []
		const limit = options.maxRows ? Math.min(options.maxRows, dataArray.length) : dataArray.length
		const compact = table.classList.contains("compact")

		for(let i = 0; i < limit; i++){
			const term = dataArray[i]
			const row = termRenderer.createRow(term, {
				compact,
				onOpen: () => this.showDetails(term, options.detailSave ? () => options.detailSave(i) : undefined)
			})
			const button = document.createElement("button")
			button.className = "btn small " + buttonClass
			button.textContent = buttonText
			button.addEventListener("click", () => onClick(i))
			row.appendChild(termRenderer.cell(button, "cell-action"))
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
			cell.textContent = table.dataset.empty || "Nothing here yet."
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
			const save = (i) => this.saveTerm(term, this.#history[term][i])
			this.#redrawTableWithButton(table, this.#history[term], term === "items" ? "Keep" : "Bind", "", save, { detailSave: save })
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
				this.#redrawTableWithButton(table, saved, "Remove", "ghost danger", (i) => {
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
		const save = (i) => this.saveTerm(term, this.#searchResults[term][i])
		this.#redrawTableWithButton(table, this.#searchResults[term], term === "items" ? "Keep" : "Bind", "", save, { maxRows: MAX_SEARCH_ROWS, detailSave: save })
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
	 * switch the Catalogue between scrolls and curses
	 * @param {string} sectionId "searchItems" | "searchCurses"
	 */
	setSearchSection(sectionId) {
		for (let button of document.querySelectorAll("[data-search]")) button.setAttribute("aria-pressed", button.dataset.search === sectionId)
		for (let section of document.querySelectorAll(".searchSections")) section.classList.toggle("active", section.id === sectionId)
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
				th.tabIndex = 0
				const sort = () => {
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
				}
				th.addEventListener("click", sort)
				th.addEventListener("keydown", (event) => { if (event.key === "Enter") sort() })
			}
		}
	}

	/**
	 * export current codex to a txt file: the character sheet, then every scroll and curse
	 */
	exportSaved() {
		const build = this.#buildsOptions.getCurrentBuildKey()
		const profile = this.#profile()
		let text = `<CODEX: ${build}>\n`;
		if (profile.name) text += `Name: ${profile.name}\n`
		if (profile.world) text += `World: ${profile.world}\n`
		if (profile.location) text += `Right now: ${profile.location}\n`
		if (profile.notes) text += `Notes: ${profile.notes}\n`
		text += `\n<SCROLLS>\n\n`;

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

	// ---------------------------------------------------------------- drawing

	/**
	 * draw from the archive or the tome: pick a result, play its reveal on the stage, record it in the history.
	 * a click while a reveal is playing skips to the end.
	 * @param {"items"|"curses"} term
	 */
	roll(term){
		if (this.#rolling[term]) { this.#rolling[term].skip(); return }

		const isItem = term === "items"
		const stage = document.getElementById(isItem ? "itemStage" : "curseStage")
		const result = this.#filteringHandler.getRandomTerm(term)
		if (!result) {
			stage.classList.remove("shake-no")
			void stage.offsetWidth
			stage.classList.add("shake-no")
			toast(isItem ? "No scroll within reach. Check your key, shelves, and content setting." : "No curses match your content setting.", "Nothing to draw")
			return
		}
		this.#history[term].unshift(result)

		const button = document.getElementById(isItem ? "itemRollButton" : "cursesRollButton")
		button.classList.add("rolling")
		// in the one-column layout the stage sits under the controls; bring it into view
		if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
			stage.scrollIntoView({ behavior: "smooth", block: "start" })
		}
		const save = (value) => this.saveTerm(term, value)

		this.#rolling[term] = gachaReveal.stageRoll({
			stage: stage,
			reel: document.getElementById(isItem ? "itemReel" : "curseReel"),
			burst: document.getElementById(isItem ? "itemBurst" : "curseBurst"),
			cardSlot: document.getElementById(isItem ? "itemCardSlot" : "curseCardSlot"),
			names: this.#reelNames(term),
			card: isItem ? termRenderer.buildItemCard(result, { onSave: save }) : termRenderer.buildCurseCard(result, { onSave: save }),
			color: isItem ? termRenderer.rankColor(result.get("rank")) : termRenderer.severityColor(result),
			tier: isItem ? termRenderer.rankTier(result.get("rank")) : termRenderer.severityTier(result),
			onOpen: () => {
				this.#rolling[term] = null
				button.classList.remove("rolling")
				this.redrawHistoryTables()
			}
		})
	}

	/**
	 * a handful of random names from the current pool for the reel
	 * @param {"items"|"curses"} term
	 */
	#reelNames(term) {
		const names = []
		for (let i = 0; i < 24; i++) {
			const entry = term === "curses" ? this.#filteringHandler.getRandomCurse() : this.#filteringHandler.getRandomItem()
			if (entry) names.push(entry.get("name"))
		}
		return names
	}

}
