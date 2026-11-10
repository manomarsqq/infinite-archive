import { describe, it, expect } from "vitest"
import { ledger, keyLabel, sourceLabel } from "./ledger.js"

/** a Map behind the Storage interface */
function memoryStorage() {
	const map = new Map()
	return {
		getItem: (key) => map.has(key) ? map.get(key) : null,
		setItem: (key, value) => map.set(key, String(value)),
	}
}

describe("ledger", () => {
	it("records draws per codex, newest first", () => {
		const log = new ledger(memoryStorage())
		log.add("a", { kind: "items", name: "Sword", star: 3, at: 1 })
		log.add("a", { kind: "curses", name: "Hex", at: 2 })
		log.add("b", { kind: "items", name: "Shield", star: 1, at: 3 })
		expect(log.entries("a").map(r => r.name)).toEqual(["Hex", "Sword"])
		expect(log.entries("a", "items").map(r => r.name)).toEqual(["Sword"])
		expect(log.entries("b")[0].star).toBe(1)
	})

	it("keeps no key on curses and rejects keys outside 0-8", () => {
		const log = new ledger(memoryStorage())
		const curse = log.add("a", { kind: "curses", name: "Hex", star: 4 })
		const item = log.add("a", { kind: "items", name: "Sword", star: 12 })
		expect(curse.star).toBeNull()
		expect(item.star).toBeNull()
		log.update("a", item.id, { star: "0" })
		expect(log.entries("a", "items")[0].star).toBe(0)
	})

	it("survives a reload through storage", () => {
		const storage = memoryStorage()
		const first = new ledger(storage)
		const record = first.add("a", { kind: "items", name: "Sword", star: 2 })
		first.update("a", record.id, { note: "slew the wolf" })
		const second = new ledger(storage)
		expect(second.entries("a")[0]).toMatchObject({ name: "Sword", star: 2, note: "slew the wolf" })
	})

	it("marks the newest unkept draw of a name as kept, and unmarks the newest kept one", () => {
		const log = new ledger(memoryStorage())
		const older = log.add("a", { kind: "items", name: "Sword", at: 1 })
		const newer = log.add("a", { kind: "items", name: "Sword", at: 2 })
		expect(log.markKept("a", "items", "Sword").id).toBe(newer.id)
		expect(log.markKept("a", "items", "Sword").id).toBe(older.id)
		expect(log.markKept("a", "items", "Sword")).toBeNull()
		log.unmarkKept("a", "items", "Sword")
		const byId = Object.fromEntries(log.entries("a").map(r => [r.id, r.kept]))
		expect(byId).toEqual({ [older.id]: true, [newer.id]: false })
	})

	it("clears unkept draws and deletes a codex", () => {
		const log = new ledger(memoryStorage())
		log.add("a", { kind: "items", name: "Sword", kept: true })
		log.add("a", { kind: "items", name: "Shield" })
		expect(log.clearUnkept("a")).toBe(1)
		expect(log.entries("a").map(r => r.name)).toEqual(["Sword"])
		log.deleteCodex("a")
		expect(log.entries("a")).toEqual([])
	})

	it("starts empty when storage holds garbage", () => {
		const storage = memoryStorage()
		storage.setItem("infiniteArchive.ledger", "{not json")
		expect(new ledger(storage).entries("a")).toEqual([])
	})

	it("labels keys and sources", () => {
		expect(keyLabel(null)).toBe("Key not set")
		expect(keyLabel(0)).toBe("No key (any shelf)")
		expect(keyLabel(8)).toBe("EX★ The gap")
		expect(sourceLabel({ source: "curse", from: "Hex" })).toBe('Quickstart, paid by "Hex"')
	})
})
