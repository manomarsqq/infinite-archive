export {gachaItem}

import { itemTags } from "./itemTags"
import { gachaTerm } from "./gachaTerm"

class gachaItem extends gachaTerm {

	/** @type {itemTags} */
	tags

	/**
	 * key and table header for every column, in sheet order.
	 * used by the renderer for table headers and by search to map typed headers to keys.
	 * @type {{key: string, label: string}[]}
	 */
	static columns = [
		{ key: "name", label: "Name" },
		{ key: "series", label: "Series" },
		{ key: "description", label: "Short Description" },
		{ key: "category", label: "Category" },
		{ key: "gender", label: "Gender" },
		{ key: "magic", label: "Magic" },
		{ key: "memetic", label: "Memetic" },
		{ key: "might", label: "Might" },
		{ key: "mind", label: "Mind" },
		{ key: "motion", label: "Motion" },
		{ key: "moxie", label: "Moxie" },
		{ key: "mutation", label: "Mutation" },
		{ key: "myth", label: "Myth" },
		{ key: "stats", label: "Stats" },
		{ key: "rank", label: "Rank" },
		{ key: "growthType", label: "Growth Type" },
		{ key: "growthRate", label: "Growth Rate" },
		{ key: "restock", label: "Restock" },
		{ key: "returnValue", label: "Return" },
		{ key: "gift", label: "Gift" },
		{ key: "nsfw", label: "NSFW" },
	]

	/** the eight "8M" stat keys, in order */
	static statKeys = ["magic", "memetic", "might", "mind", "motion", "moxie", "mutation", "myth"]

	/**
	 *
	 * @param {*[]} array
	 * @returns {object} object that can be passed into constructor
	 */
	static arrayToKeyedObject(array) {
		return {
			name: array[0],
			series: array[1],
			description: array[2],
			category: array[3],
			gender: array[4],
			magic: array[5],
			memetic: array[6],
			might: array[7],
			mind: array[8],
			motion: array[9],
			moxie: array[10],
			mutation: array[11],
			myth: array[12],
			stats: parseInt(array[13]),
			rank: array[14],
			growthType: array[15],
			growthRate: array[16],
			restock: array[17],
			returnValue: array[18],
			gift: array[19] == "TRUE",
			nsfw: array[20] == "TRUE",
		}
	}

	/**
	 *
	 * @param {object} object object as definied by static arrayToKeyedObject function
	 * @param {boolean[]} tags array of tags values gotten from sheet
	 */
	constructor(object, tags){
		const values = structuredClone(object)
		super(values)

		this.tags = new itemTags(tags)
	}

	/**
	 * convert an item to a string
	 * @returns {string}
	 */
	toString() {
		let sfw = ""
		if (super.get("nsfw")) sfw = " | NSFW"
		return `${super.get("name")} | ${super.get("series")}\nRank ${super.get("rank")} | ${super.get("category")}${sfw}\n${super.get("description")}`
	}

	/**
	 * convert an array of gacha items to an array of their names. used to save builds.
	 * @param {gachaItem[]} itemsArray
	 * @returns {string[]}
	 */
	static toNameArray(itemsArray){
		return super.toNameArray(itemsArray)
	}

	/**
	 * given a name of an item, return the item with that name
	 * @param {string} name
	 * @param {gachaItem[]} rawItems
	 * @returns {gachaItem|undefined} Item that matches the name
	*/
	static nameToFull(name, rawItems){
		return super.nameToFull(name, rawItems)
	}
}
