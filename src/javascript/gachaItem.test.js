import { gachaItem } from "./gachaItem.js";
import { expect, test } from "vitest";

// values.json is built from the sheet and gitignored, so these tests only run when it exists
const dataFiles = import.meta.glob("../data/values.json", { import: "default", eager: true })
const valuesJson = dataFiles["../data/values.json"]

/**
 * build gachaItems from the raw json rows
 * @returns {{"items": gachaItem[]}}
 */
function setup() {
	const values = structuredClone(valuesJson)
	const itemsArray = []

	for(let value of values.items){
		itemsArray.push(new gachaItem(gachaItem.arrayToKeyedObject(value), value.slice(23)))
	}

	return { items: itemsArray }
}

test.skipIf(!valuesJson)("first item tests", function () {
	const data = setup()

	const firstItem = data.items[0]
	expect(firstItem.get("name")).toEqual("Fire Manipulation")
	expect(firstItem.get("nsfw")).toBe(false)
	expect(firstItem.get("stats")).toBe(10)
})

test.skipIf(!valuesJson)("first item tag tests", function () {
	const data = setup()
	const firstItem = data.items[0]

	expect(firstItem.tags.toString()).toEqual("magicGeneric")
})

test("toString reports the rank, not the series", function () {
	const item = new gachaItem(gachaItem.arrayToKeyedObject(["Sword", "Generic", "A sword.", "Arsenal", "N/A", "F", "F", "D", "F", "F", "F", "F", "F", "5", "E", "N/A", "N/A", "N/A", "N/A", "FALSE", "FALSE"]), [])
	expect(item.toString()).toEqual("Sword | Generic\nRank E | Arsenal\nA sword.")
})
