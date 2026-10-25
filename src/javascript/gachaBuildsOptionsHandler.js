import { cookiesHandler } from "./cookiesHandler.js"
import { gachaItem } from "./gachaItem.js"
import { gachaCurse } from "./gachaCurse.js"

export { gachaBuildsOptionsHandler }

/**
 * handle builds and options values, as they are intertwined.
 * never touches the DOM; pageHandler reflects changes into the page.
 */
class gachaBuildsOptionsHandler {
	#buildsValues = {}
	#optionsValues = {
		"backgroundImage": true,
		"theme": "archive",
		"build": "default",
		"buildsArray": ["default"],

		"NSFW": false,
		"NSFWOnly": false

	}
	#cookiesHandler

	constructor() {
		this.#cookiesHandler = new cookiesHandler(this.#buildsValues, this.#optionsValues)
	}

	/**
	 * initalize builds and options
	 * @returns {Promise<void>} promise resolved when ititalization done.
	 */
	async intialize(rawData) {
		return this.#cookiesHandler.cookieInit(rawData)
	}

	/**
	 * create a new build and switch to it
	 * @param {string} newBuild
	 * @returns {boolean} false when a build of that name already exists
	*/
	createNewBuild(newBuild) {
		if (this.#optionsValues.buildsArray.indexOf(newBuild) != -1) return false
		this.#optionsValues.buildsArray.push(newBuild)
		this.#buildsValues[newBuild] = { items: [], curses: [] }

		this.switchBuild(newBuild)
		this.saveBuilds()
		return true
	}

	/**
	 * switch build to the desired.
	 * @param {String} value
	*/
	switchBuild(value) {
		if (this.#optionsValues.buildsArray.indexOf(value) == -1) {
			console.error(`"${value}" is not a build`)
			return
		}
		this.#optionsValues.build = value
		this.saveOptions();
	}

	/**
	 * delete build determined by string.
	 * @param {String} build
	*/
	deleteBuild(build) {
		delete this.#buildsValues[build]
		this.#optionsValues.buildsArray.splice(this.#optionsValues.buildsArray.indexOf(build), 1)
		switch (true) {
			case (this.#optionsValues.buildsArray.length == 0):
				this.createNewBuild("default")
				break;
			case (this.#optionsValues.build == build):
				this.switchBuild(this.#optionsValues.buildsArray[0])
				break;
			default:
				break;
		}
		this.saveAll()
	}

	/**
	 * change multiple options at once
	 * if none provided simply return and don't save
	 * @param  {...{key: string, value: string|boolean}} pairs
	 */
	changeOptionMultiple(...pairs) {
		if (pairs.length == 0) {
			return;
		}
		for (let pair of pairs) {
			this.#optionsValues[pair.key] = pair.value
		}
		this.saveOptions()
	}

	/**
	 * change and save option accordingly.
	 * @param {string} key
	 * @param {string|boolean} value
	 */
	changeOption(key, value) {
		this.#optionsValues[key] = value
		this.saveOptions()
		return value
	}
	/**
	 * get an option value
	 * @param {string} key key of the option to get
	 * @returns {string|string[]}
	 */
	getOption(key) {
		return this.#optionsValues[key]
	}

	/**
	 *
	 * @param {...string} keys
	 * @returns {string[]}
	 */
	getOptions(...keys) {
		const values = []
		for (let key of keys) {
			values.push(this.getOption(key))
		}
		return values
	}

	/**
	 * return a specific build, or the current one if blank. creates it when missing.
	 * @param {string} buildName current build by default
	 * @returns {{
	 * 	items: gachaItem[]
	 * 	curses: gachaCurse[]
	 * }}
	 */
	#getBuild(buildName = this.#optionsValues.build) {
		if (!this.#buildsValues[buildName]) this.#buildsValues[buildName] = { items: [], curses: [] }
		return this.#buildsValues[buildName]
	}

	/**
	 * get shallow copy of items
	 * @returns {gachaItem[]} Shallow Copy of saved items
	 */
	getCurrentSavedItems() {
		return this.getCurrentSaved("items")
	}
	/**
	 * get shallow copy of curses
	 * @returns {gachaCurse[]} Shallow Copy of saved curses
	 */
	getCurrentSavedCurses() {
		return this.getCurrentSaved("curses")
	}
	/**
	 * get shallow copy of current saved items or curses
	 * @param {string} term "items"/"curses"
	 * @returns {null|gachaCurse[]|gachaItem[]} null on invalid term, gachaTerm[] depending on term.
	 */
	getCurrentSaved(term) {
		if (term != "items" && term != "curses") {
			console.warn(`not meant to be called by "${term}", please use "items" or "curses"`)
			return null
		}
		return Array.from(this.#getBuild()[term])
	}

	/**
	 * sort the saved entries of the current build in place
	 * @param {string} term "items"/"curses"
	 * @param {(a: gachaItem|gachaCurse, b: gachaItem|gachaCurse) => number} compareFunction
	 */
	sortCurrentSaved(term, compareFunction) {
		this.#getBuild()[term].sort(compareFunction)
	}

	/**
	 *
	 * @param {string} term "items"/"curses"
	 * @param {number} index index to splice out
	 * @returns {gachaItem|gachaCurse} removed term
	 */
	removeCurrentSaved(term, index) {
		//splice always returns an array, which is 1 long, so [0] just kills the unnessary other step
		const returnValue = this.#getBuild()[term].splice(index, 1)[0]
		this.saveBuilds();
		return returnValue
	}
	/**
	 *
	 * @param {number} index index of item to remove
	 * @returns {gachaItem} removed item
	 */
	removeCurrentSavedItem(index) {
		return this.removeCurrentSaved("items", index)
	}

	/**
	 *
	 * @param {number} index index of curse to remove
	 * @returns {gachaCurse} removed curse
	 */
	removeCurrentSavedCurse(index) {
		return this.removeCurrentSaved("curses", index)
	}

	/**
	 *
	 * @returns {string} name of current build
	 */
	getCurrentBuildKey() {
		return this.#optionsValues.build
	}

	/**
	 * save an item/curse to the build
	 * @param {string} term "items"/"curses"
	 * @param {gachaItem|gachaCurse} newTerm
	 * @returns {gachaItem|gachaCurse} newTerm
	 */
	saveTerm(term, newTerm) {
		this.#getBuild()[term].push(newTerm)
		this.saveBuilds()
		return newTerm
	}

	/**
	 * save several items or curses at once (quickstart "save all"), one cookie write
	 * @param {string} term "items"/"curses"
	 * @param {(gachaItem|gachaCurse)[]} newTerms
	 */
	saveTerms(term, newTerms) {
		this.#getBuild()[term].push(...newTerms)
		this.saveBuilds()
	}

	/**
	 *
	 * @param {gachaItem} newItem
	 * @returns {gachaItem} newItem
	 */
	saveItem(newItem) {
		return this.saveTerm("items", newItem)
	}

	/**
	 *
	 * @param {gachaCurse} newCurse
	 * @returns {gachaCurse} newCurse
	 */
	saveCurse(newCurse) {
		return this.saveTerm("curses", newCurse)
	}

	/**
	 * save everything
	 */
	saveAll() {
		this.saveBuilds()
		this.saveOptions()
	}
	/**
	 * save builds
	 */
	saveBuilds() {
		this.#cookiesHandler.buildCookieSave()
	}
	/**
	 * save options
	 */
	saveOptions() {
		this.#cookiesHandler.optionsCookieSave()
	}
};
