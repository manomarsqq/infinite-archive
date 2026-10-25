export { gachaCurse }
import { gachaTerm } from "./gachaTerm";

class gachaCurse extends gachaTerm{

	/**
	 * key and table header for every column, in sheet order.
	 * @type {{key: string, label: string}[]}
	 */
	static columns = [
		{ key: "name", label: "Name" },
		{ key: "description", label: "Description" },
		{ key: "resolution", label: "Resolution" },
		{ key: "level", label: "Severity" },
		{ key: "target", label: "Target" },
		{ key: "affects", label: "Affects" },
		{ key: "nsfw", label: "NSFW" },
		{ key: "reward", label: "Reward" },
	]

	/**
	 *
	 * @param {string[]} array
	 * @returns object to pass to constructor
	 */
	static arrayToKeyedObject(array) {
		return {
			name: array[0],
			description: array[1],
			resolution: array[2],
			level: array[3],
			target: array[4],
			affects: array[5],
			nsfw: (array[6] == "TRUE"),
			reward: array[7],
		}
	}

	constructor(curseObject) {
		const values = structuredClone(curseObject)
		super(values)
	}

	/**
	* converts a curse to a string
	* @returns {string}
	*/
	toString() {
		let sfw = ""
		if (super.get("nsfw")) sfw = " | NSFW"
		return `${super.get("name")} | ${super.get("level")}${sfw}\n${super.get("description")}\nResolution: ${super.get("resolution")}`
	}

	/**
	 * "Minor Inconvenience" -> "minor", "Moderately Lethal Danger" -> "moderate", "Major Distress" -> "major"
	 * @returns {"minor"|"moderate"|"major"|""}
	 */
	severity(){
		const level = String(super.get("level")).toLowerCase()
		if (level.startsWith("minor")) return "minor"
		if (level.startsWith("moderate")) return "moderate"
		if (level.startsWith("major")) return "major"
		return ""
	}

	/**
	 * "2x 4 Star, 1x EX Star" -> [{star: 4, n: 2}, {star: 8, n: 1}]. EX is star level 8, like the ticket selector.
	 * @returns {{star: number, n: number}[]} empty when the reward text is not in that form
	 */
	rewardTickets(){
		const out = []
		for (const match of String(super.get("reward") || "").matchAll(/(\d+)\s*x\s*(EX|\d+)\s*star/gi)) {
			const n = parseInt(match[1], 10)
			const star = match[2].toUpperCase() === "EX" ? 8 : parseInt(match[2], 10)
			if (n > 0 && star >= 1 && star <= 8) out.push({ star, n })
		}
		return out
	}

	/**
	 * convert an array of gacha curses to an array of their names. used to save builds.
	 * @param {gachaCurse[]} cursesArray
	 * @returns {string[]}
	 */
	static toNameArray(cursesArray){
		return super.toNameArray(cursesArray)
	}

	/**
	 * given a name of a curse, return the curse with that name
	 * @param {string} name
	 * @param {gachaCurse[]} rawCurses
	 * @returns {gachaCurse|undefined} Curse that matches the name
	*/
	static nameToFull(name, rawCurses){
		return super.nameToFull(name, rawCurses)
	}

}
