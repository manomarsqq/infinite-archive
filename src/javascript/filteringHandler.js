import {
	smartSplit,
	arrayMerge
} from "./utils.js";
import { gachaBuildsOptionsHandler } from "./gachaBuildsOptionsHandler.js"

export { filteringHandler }

import { gachaItem } from "./gachaItem.js";
import { gachaCurse } from "./gachaCurse.js";

/**
 * every json file in /data, as a url, resolved at build time.
 * values.json is gitignored and built by build.js, so it may be missing on a fresh clone;
 * a glob only lists files that exist, which lets loadParseJSON fall back to the sample file.
 */
const dataFiles = import.meta.glob("/data/*.json", { query: "?url", import: "default", eager: true })

/**
 * handle all filtering, prepping,
 * and searching (which is also just filtering to user defined paramaters)
 * do not read/write to dom do not pass go, do not collect 100 dollars, etc.
 * do keep track of filters, and change when function called
 *
 * do not construct raw, use filteringHandler.build() to get a promise that resolves to the object.
 */
class filteringHandler {
	/**
	 * @type {gachaBuildsOptionsHandler}
	 */
	#buildsOptions
	/**
	 * @type {{
	 *   raw: { items: gachaItem[], curses: gachaCurse[] },
	 *   filtered: { items: gachaItem[], curses: gachaCurse[] },
	 *   roll: { items: gachaItem[], curses: gachaCurse[] }
	 * }}
	 */
	#data = {
		"raw": {},
		"filtered": {},
		"roll": {}
	}

	static defaultFilters = {
		"rank": [
			"F", "E", "D", "C", "B", "A", "S", "SS", "SSS", "EX"
		],
		"category": [
			"Ability", "Arsenal", "Consumable", "Familiar", "Farmable", "Novelty", "Passive", "Race", "Skill", "Vehicle", "Wearable", "World"
		]
	}

	/** star level (1-8) -> ranks that ticket can roll. 0 means no ticket, every rank. */
	static ticketRanks = {
		1: ["F", "E", "D"],
		2: ["E", "D", "C"],
		3: ["D", "C", "B"],
		4: ["C", "B", "A"],
		5: ["B", "A", "S"],
		6: ["A", "S", "SS"],
		7: ["S", "SS", "SSS"],
		8: ["SS", "SSS", "EX"],
	}

	/** rank order, weakest first. used for sorting and for how dramatic a reveal is. */
	static rankOrder = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS", "EX"]

	// a copy, so changing the category filter never mutates the static defaults
	#filters = structuredClone(filteringHandler.defaultFilters)

	/** true when values.json was missing and the sample file was loaded instead */
	static usingSampleData = false

	/**
	 * static async function to load and parse the json data.
	 * prefers data/values.json (built from the sheet), falls back to data/sampleValues.json.
	 * @returns {Promise<{
	 * "items": gachaItem[]
	 * "curses": gachaCurse[]
	 * }>}
	 */
	static async loadParseJSON() {
		let url = dataFiles["/data/values.json"]
		if (!url) {
			url = dataFiles["/data/sampleValues.json"]
			filteringHandler.usingSampleData = true
			console.warn("data/values.json not found, using data/sampleValues.json. Run `npm run getData` with a SHEETSAPIKEY to build the real data.")
		}
		const rawfetch = await fetch(url)
		const values = await rawfetch.json()

		// the sample file is a raw sheet export and still carries its header rows; build.js strips them from values.json
		if (values.items[0] && values.items[0][0] === "Name") values.items.shift()
		if (values.curses[0] && values.curses[0][0] === "Curse Name") values.curses.shift()

		const itemsArray = []
		const cursesArray = []

		// rows without a name are blank lines from the sheet export
		for (let value of values.items) {
			if (!value[0]) continue
			itemsArray.push(new gachaItem(gachaItem.arrayToKeyedObject(value), value.slice(23)))
		}
		for (let value of values.curses) {
			if (!value[0]) continue
			cursesArray.push(new gachaCurse(gachaCurse.arrayToKeyedObject(value)))
		}

		return {
			items: itemsArray,
			curses: cursesArray
		}
	}

	/**
	 * @param {gachaBuildsOptionsHandler} buildsOptionsHandler unitialized buildsOptions Handler
	 * @returns {Promise<filteringHandler>} promised resolved on initialization complete
	 */
	static async build(buildsOptionsHandler){
		const rawData = await this.loadParseJSON()
		await buildsOptionsHandler.intialize(rawData)
		const filter = new filteringHandler(buildsOptionsHandler, rawData)
		return filter
	}

	/**
	 *
	 * @param {gachaBuildsOptionsHandler} buildsOptionsHandler
	 * @param {object} rawData
	 */
	constructor(buildsOptionsHandler, rawData) {
		this.#buildsOptions = buildsOptionsHandler
		this.#data.raw = rawData;
		this.updateContentFilter()
	}

	/**
	 * update the filtered data from the NSFW options, then update the roll data.
	 * NSFW off: only SFW entries. NSFW on: everything. NSFW on + NSFW only: only NSFW entries.
	 */
	updateContentFilter() {
		const nsfw = this.#buildsOptions.getOption("NSFW")
		const nsfwOnly = this.#buildsOptions.getOption("NSFWOnly")

		for (let key in this.#data.raw) {
			if (nsfw && !nsfwOnly) this.#data.filtered[key] = Array.from(this.#data.raw[key])
			else this.#data.filtered[key] = this.#data.raw[key].filter(filteringHandler.exactValueFilter([nsfw && nsfwOnly], "nsfw"))
		}

		this.updateRollData()
	}

	/**
	 * update the rank filter based on numeric star level, then the roll data
	 * @param {number|string} starLevel 0-8, 0 or anything unknown means every rank
	 */
	updateRankFilter(starLevel) {
		this.#filters.rank = filteringHandler.ticketRanks[parseInt(starLevel)] || filteringHandler.defaultFilters.rank
		this.updateRollData()
	}

	/**
	 * to reset them all to nothing, or all on
	 * @param {boolean} isAll
	 */
	resetCategoryFilter(isAll){
		if(isAll) { this.#filters.category = Array.from(filteringHandler.defaultFilters.category) }
		else { this.#filters.category = [] }
		this.updateRollData()
	}

	/**
	 * based on the string and the boolean, either take the filter out or put it in
	 * @param {string} category
	 * @param {boolean} isChecked
	 */
	updateCategoryFilter(category, isChecked){
		const index = this.#filters.category.indexOf(category)
		if(isChecked && index == -1) {
			this.#filters.category.push(category)
		}
		else if (!isChecked && index != -1) {
			this.#filters.category.splice(index, 1);
		}
		this.updateRollData()
	}

	/**
	 * @returns {string[]} categories currently in the filter
	 */
	getCategoryFilter(){
		return Array.from(this.#filters.category)
	}

	/**
	 * get a constant reference to data.filtered.items, mutate acordingly
	 * and assign to data.roll.items. category matching ignores case because the checkboxes use lowercase values.
	 */
	#updateItemRollData() {
		let workingItems = this.#data.filtered.items
		workingItems = workingItems.filter(filteringHandler.exactTextValueFilter(this.#filters.rank, "rank"))
		workingItems = workingItems.filter(filteringHandler.exactTextValueFilter(this.#filters.category, "category"))
		this.#data.roll.items = workingItems
	}

	/**
	 * currently, just sets roll.curses to filtered.curses
	 * method and additional variable exists for future proofing.
	 */
	#updateCurseRollData() {
		this.#data.roll.curses = this.#data.filtered.curses
	}

	/**
	 * update #data.roll
	 */
	updateRollData() {
		this.#updateItemRollData()
		this.#updateCurseRollData()
	}

	/**
	 * how many entries the current filters leave to roll from
	 * @param {string} term "items"/"curses"
	 * @returns {number}
	 */
	getRollPoolSize(term){
		return this.#data.roll[term].length
	}

	/**
	 * content-filtered entries (NSFW settings applied, ticket and category filters not).
	 * quickstart rolls from this with its own rank filter per ticket.
	 * @param {string} term "items"/"curses"
	 * @returns {gachaItem[]|gachaCurse[]} a copy
	 */
	getFiltered(term){
		return Array.from(this.#data.filtered[term])
	}

	/**
	 * random item for a given ticket star level, from the content-filtered data
	 * @param {number} starLevel 1-8
	 * @returns {gachaItem|null}
	 */
	getRandomItemForTicket(starLevel){
		const ranks = filteringHandler.ticketRanks[starLevel] || filteringHandler.defaultFilters.rank
		return filteringHandler.getRandomValue(this.#data.filtered.items.filter(filteringHandler.exactTextValueFilter(ranks, "rank")))
	}

	/**
	 * filter by exact value
	 * for filter by contains, use textFilter
	 *
	 * @param {(string|number|boolean)[]} filterArray array of things to match to
	 * @param {string} key what key of the item/curse to check against
	 * @returns function to use in array.filter()
	 */
	static exactValueFilter(filterArray, key) {
		return function (term) {
			const valuePart = term.get(key)
			for (let filter of filterArray) {
				if (valuePart == filter) return true
			}
			return false;
		}
	}

	/**
	 * filter by non case sensitive exact text value
	 * for filter by contains, use textFilter
	 *
	 * @param {(string|number|boolean)[]} filterArray array of things to match to
	 * @param {string} key what key of the item/curse to check against
	 * @returns function to use in array.filter()
	 */
	static exactTextValueFilter(filterArray, key) {
		return function (term) {
			const valuePart = String(term.get(key)).toLowerCase()
			for (let filter of filterArray) {
				if (valuePart == String(filter).toLowerCase()) return true
			}
			return false;
		}
	}

	/**
	 * filter by text value. text only needs to be part of, not exact match
	 * for exact match use valueFilter
	 *
	 * @param {string[]} filterArray array of things to match to
	 * @param {string} key what key to check against
	 * @returns function to use in array.filter()
	 */
	static textValueFilter(filterArray, key) {
		return function (term) {
			const value = String(term.get(key)).toLowerCase();
			for (let filter of filterArray) {
				if (value.includes(String(filter).toLowerCase())) return true
			}
			return false;
		}
	}

	/**
	 * get a random thing out of an array. null when the array is empty, so callers can bail out.
	 * @param {*[]} array
	 * @returns {*|null}
	 */
	static getRandomValue(array) {
		if (!array || array.length === 0) return null
		let randomIndex = Math.floor(Math.random() * array.length);
		return array[randomIndex];
	}

	/**
	 *
	 * @param {string} term "items"/"curses"
	 * @returns {gachaItem|gachaCurse|null}
	 */
	getRandomTerm(term){
		return filteringHandler.getRandomValue(this.#data.roll[term])
	}

	/**
	 * get a random gacha item from roll data
	 * @returns {gachaItem|null}
	 */
	getRandomItem(){
		return this.getRandomTerm("items")
	}
	/**
	 * get a random gacha curse from roll data
	 * @returns {gachaCurse|null}
	 */
	getRandomCurse(){
		return this.getRandomTerm("curses")
	}

	/**
	 * n distinct random curses from the roll data (fewer when there are not enough)
	 * @param {number} n
	 * @returns {gachaCurse[]}
	 */
	getRandomCurses(n){
		const pool = Array.from(this.#data.roll.curses)
		const out = []
		while (out.length < n && pool.length) {
			out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
		}
		return out
	}

	/**
	 * search the data for all maching based on the searchText string
	 * @param {string} searchText
	 * @returns {gachaItem[]}
	 */
	searchItems(searchText){
		return this.searchTerm(searchText, "items")
	}

	/**
	 * search the data for all maching based on the searchText string
	 * @param {string} searchText
	 * @returns {gachaCurse[]}
	 */
	searchCurses(searchText){
		return this.searchTerm(searchText, "curses")
	}

	/**
	 * advanced-syntax search only
	 * @param {string} searchText
	 * @param {string} term "items"/"curses"
	 * @returns {gachaItem[]|gachaCurse[]|null} null if term invalid
	 */
	searchTerm(searchText, term){
		return this.search({ advanced: searchText }, term)
	}

	/**
	 * full search: plain "contains" matches on named keys, then the advanced syntax on top.
	 * @param {{basic?: Object<string, string>, advanced?: string}} query
	 *   basic: key -> comma separated text, e.g. { name: "sword", series: "bleach,one piece" }. empty strings are ignored.
	 *   advanced: "Header:value Header2:a,b" syntax, see #searchTextToObjects
	 * @param {string} term "items"/"curses"
	 * @returns {gachaItem[]|gachaCurse[]|null} null if term invalid
	 * @throws {RangeError} when an advanced header is not a column
	 */
	search(query, term){
		if(term != "items" && term != "curses") return null

		let resultsData = this.#data.filtered[term]
		for (let key in (query.basic || {})) {
			const text = String(query.basic[key]).trim()
			if (text === "") continue
			resultsData = resultsData.filter(filteringHandler.textValueFilter(text.toLowerCase().split(","), key))
		}
		if (query.advanced && query.advanced.trim() !== "") {
			resultsData = this.#advancedSearch(query.advanced, resultsData, term)
		}
		return resultsData
	}

	/**
	 * verify the search text, and construct the search objects
	 *
	 * @param {string} searchText
	 * @returns {{properties: string[], values: string[]}[]} searchObjects
	 */
	#searchTextToObjects(searchText){
		const searchValues = this.#searchTextVerifySplit(searchText)
		const searchObjects = []

		for(let string of searchValues){
			const parts = string.split(":")
			searchObjects.push({
				properties: smartSplit(parts[0], ","),
				values: smartSplit(parts[1], ",")
			})
		}

		return searchObjects
	}

	/**
	 * split apart search text into values, and verify parts.
	 * does not construct search object
	 *
	 * @param {string} searchText
	 * @returns {string[]}
	 */
	#searchTextVerifySplit(searchText){
		let searchValues = smartSplit(searchText, " ")

		const advancedSearchVerifyPattern = /^[a-z0-9 ]+(,[a-z0-9 ]+)*:[a-z0-9 ]+(,[a-z0-9 ]+)*$/i;
		searchValues = searchValues.filter(function (value) {
			return (value.match(advancedSearchVerifyPattern));
		});

		return searchValues
	}

	/**
	 * typed header -> column key. accepts the table header text ("growth type", "severity")
	 * as well as the key itself ("growthType", "level"), ignoring case and spaces.
	 * @param {string} header
	 * @param {string} term "items"/"curses"
	 * @returns {string|null} key, or null when unknown
	 */
	static headerToKey(header, term){
		const wanted = String(header).toLowerCase().replace(/\s+/g, "")
		const aliases = term == "curses" ? { curse: "name", severity: "level" } : { return: "returnValue" }
		if (aliases[wanted]) return aliases[wanted]
		const columns = term == "curses" ? gachaCurse.columns : gachaItem.columns
		for (let column of columns) {
			if (column.key.toLowerCase() == wanted || column.label.toLowerCase().replace(/\s+/g, "") == wanted) return column.key
		}
		return null
	}

	/**
	 * which filter a column uses: ranks and stats match exactly, text columns match "contains"
	 * @param {string} key
	 * @param {string} term
	 * @returns {function}
	 */
	#keyToFilter(key, term){
		if(term == "curses") return filteringHandler.textValueFilter
		if (gachaItem.statKeys.indexOf(key) != -1 || key == "rank") return filteringHandler.exactTextValueFilter
		if (key == "stats") return filteringHandler.exactValueFilter
		return filteringHandler.textValueFilter
	}

	/**
	 * advanced syntax: space separated terms are ANDed, "a,b" headers or values within one term are ORed
	 * @param {string} searchText
	 * @param {gachaItem[]|gachaCurse[]} startData
	 * @param {string} term "items"/"curses"
	 * @throws {RangeError} when a header is not a column
	 */
	#advancedSearch(searchText, startData, term) {
		const searchObjects = this.#searchTextToObjects(searchText)

		let resultsData = startData
		for(let searchObject of searchObjects){
			let resultsDataParts = []
			for(let header of searchObject.properties){
				const key = filteringHandler.headerToKey(header, term)
				if (!key) throw new RangeError(`"${header}" is not a column`)
				const filterFunction = this.#keyToFilter(key, term)
				resultsDataParts.push( resultsData.filter(filterFunction(searchObject.values, key) ))
			}
			resultsData = arrayMerge(resultsDataParts)
		}

		return resultsData
	}
}
