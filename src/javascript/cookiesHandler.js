import { gachaItem } from "./gachaItem.js"
import { gachaCurse } from "./gachaCurse.js"

export {
	cookiesHandler
}

const ONE_YEAR = 1000 * 60 * 60 * 24 * 365

/**
 * handles saving and getting cookies
 */
class cookiesHandler {
	#buildsValues
	#optionsValues
	/**
	 * create the cookie handler class.
	 * @param {object} buildsValues reference to buildsValues object
	 * @param {object} optionsValues reference to optionsValues object
	 */
	constructor(buildsValues, optionsValues){
		this.#buildsValues = buildsValues
		this.#optionsValues = optionsValues
	}

	/**
	 * read one cookie's value, or null when it is missing or the Cookie Store API is unavailable
	 * @param {string} name
	 * @returns {Promise<string|null>}
	 */
	static async #readCookie(name) {
		if (typeof cookieStore === "undefined") return null
		const cookie = await cookieStore.get(name)
		return cookie ? cookie.value : null
	}

	/**
	 *
	 * @returns {Promise<void>} promise resolved on save finished
	 */
	buildCookieSave() {
		//saving all that data takes a lot of the 4098 Byte limit, save just names instead.
		//for now it works, an outright ID or further compression shouldn't be required, yet.
		let truncatedBuildValues = {};
		for (let build in this.#buildsValues) {
			truncatedBuildValues[build] = {
				items: gachaItem.toNameArray(this.#buildsValues[build].items),
				curses: gachaCurse.toNameArray(this.#buildsValues[build].curses)
			};
		}

		return cookieStore.set({
			"name": "builds",
			value: JSON.stringify(truncatedBuildValues),
			expires: Date.now() + ONE_YEAR
		})
	}


	/**
	 * get the build cookie data, complete the data, return it.
	 * names that no longer exist in the sheet are dropped.
	 * @param {{
	 * 	items: gachaItem[],
	 * 	curses: gachaCurse[]}} rawData
	 * @returns {Promise<object>} builds keyed by name
	*/
	static async buildCookieInit(rawData) {
		let returnValues = {}

		try {
			const json = JSON.parse(await cookiesHandler.#readCookie("builds"))
			for (let build in json) {
				let buildValues = {
					"items": [],
					"curses": []
				};

				for (let item of json[build].items) {
					const full = gachaItem.nameToFull(item, rawData.items)
					if (full) buildValues.items.push(full);
				}
				for (let curse of json[build].curses) {
					const full = gachaCurse.nameToFull(curse, rawData.curses)
					if (full) buildValues.curses.push(full);
				}

				returnValues[build] = buildValues
			}
		}
		catch (error) {
			// no cookie yet, or an unreadable one: start fresh
		}
		if (!returnValues.default) {
			returnValues.default = {
				"items": [],
				"curses": []
			};
		}
		return returnValues;
	}

	/**
	 * trys to load the saved options cookie and if that fails, return a default
	 * @returns optionsValues
	*/
	static async optionCookieInit() {
		//defaults
		let optionsValues = {
			"backgroundImage": true,
			"theme": "archive",
			"build": "default",
			"buildsArray": ["default"],
			"NSFW": false,
			"NSFWOnly": false
		}
		try {
			const optionsResults = JSON.parse(await cookiesHandler.#readCookie("options"))
			for (let option in optionsResults) {
				optionsValues[option] = optionsResults[option]
			}
		}
		catch (error) {
			// no cookie yet: defaults stay
		}

		return optionsValues
	}
	/**
	 * call the two cookie init functions and mutate the given (preferably) empty object with saved values
	 * @returns {Promise<void>} promise resolved on function completion
	 */
	async cookieInit(rawData) {
		const optionsCookieResults = await cookiesHandler.optionCookieInit()
		const buildCookieResults = await cookiesHandler.buildCookieInit(rawData)

		for (let option in optionsCookieResults) {
			this.#optionsValues[option] = optionsCookieResults[option]
		}
		for (let build in buildCookieResults) {
			this.#buildsValues[build] = buildCookieResults[build]
		}
		// the options cookie lists the builds; make sure each one exists even if the builds cookie lost it
		for (let build of this.#optionsValues.buildsArray) {
			if (!this.#buildsValues[build]) this.#buildsValues[build] = { items: [], curses: [] }
		}
		if (!this.#buildsValues[this.#optionsValues.build]) this.#optionsValues.build = this.#optionsValues.buildsArray[0]
		return;
	}

	/**
	 * update the saved optionCookie
	 * @returns {Promise} promise reolved save on completion
	*/
	optionsCookieSave() {
		return cookieStore.set({
			name: "options",
			value: JSON.stringify(this.#optionsValues),
			expires: Date.now() + ONE_YEAR
		}).then(function (value) {
			return;
		}, function (reason) {
			console.error("saving cookies failed");
			console.error(reason);
		});
	}
}
