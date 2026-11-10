export { ledger, KEY_LABELS, keyLabel, sourceLabel }

/*
 * The ledger: every draw made for a codex, in order, with the key it came from and when.
 *
 * One list per codex, stored in localStorage (the codex cookie only holds names, and a cookie is
 * too small for a history). A record looks like
 *
 *   { id, kind: "items"|"curses", name, star, source, from, at, note, kept }
 *
 *   star    the key: 0 = no key (any shelf), 1-8 = 1★ … EX★, null = not set. curses have no key.
 *   source  "draw"       drawn on the Draw page
 *           "start"      Quickstart, a key from the way in
 *           "curse"      Quickstart, a key paid out by a curse (from = the curse's name)
 *           "quickstart" Quickstart, a curse it bound
 *           "catalogue"  kept from the Catalogue, no draw behind it
 *   at      ms timestamp of the draw
 *   note    the user's own words, e.g. what earned the key
 *   kept    whether it is in the codex
 *
 * Never touches the DOM. pageHandler renders it.
 */

const STORAGE_KEY = "infiniteArchive.ledger"

// oldest records are dropped past this many per codex, so storage cannot grow without bound
const MAX_PER_CODEX = 2000

/** key names by star level, as shown in the ledger and the Draw panel */
const KEY_LABELS = ["No key (any shelf)", "1★ Iron", "2★ Silver", "3★ Blue steel", "4★ Gold", "5★ Platinum", "6★ Crystal", "7★ Star-iron", "EX★ The gap"]

/**
 * @param {number|null} star
 * @returns {string}
 */
function keyLabel(star) {
	if (star === null || star === undefined) return "Key not set"
	return KEY_LABELS[star] || "Key not set"
}

/**
 * where a record came from, in a few words
 * @param {{source: string, from?: string}} record
 * @returns {string}
 */
function sourceLabel(record) {
	switch (record.source) {
		case "draw": return "Draw page"
		case "start": return "Quickstart, from the way in"
		case "curse": return `Quickstart, paid by "${record.from}"`
		case "quickstart": return "Quickstart"
		case "catalogue": return "Kept from the Catalogue"
		default: return ""
	}
}

/** null, or a whole number 0-8 */
function validStar(star) {
	if (star === null || star === undefined || star === "") return null
	const n = Number(star)
	return Number.isInteger(n) && n >= 0 && n <= 8 ? n : null
}

class ledger {
	/** @type {Object<string, object[]>} codex name -> records, oldest first */
	#store
	/** @type {Storage|undefined} */
	#storage
	#counter = 0

	/**
	 * @param {Storage} [storage] defaults to localStorage; tests pass a stand-in
	 */
	constructor(storage = globalThis.localStorage) {
		this.#storage = storage
		this.#store = this.#load()
	}

	#load() {
		try {
			const parsed = JSON.parse(this.#storage.getItem(STORAGE_KEY))
			return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
		} catch (error) {
			return {}
		}
	}

	/** @returns {boolean} false when the browser refused to store it */
	#save() {
		try {
			this.#storage.setItem(STORAGE_KEY, JSON.stringify(this.#store))
			return true
		} catch (error) {
			return false
		}
	}

	#list(codex) {
		if (!Array.isArray(this.#store[codex])) this.#store[codex] = []
		return this.#store[codex]
	}

	#newId() {
		this.#counter = (this.#counter + 1) % 1296
		return Date.now().toString(36) + this.#counter.toString(36).padStart(2, "0") + Math.random().toString(36).slice(2, 6)
	}

	#make(entry) {
		return {
			id: this.#newId(),
			kind: entry.kind === "curses" ? "curses" : "items",
			name: String(entry.name),
			star: entry.kind === "curses" ? null : validStar(entry.star),
			source: entry.source || "draw",
			from: entry.from || "",
			at: entry.at || Date.now(),
			note: entry.note || "",
			kept: !!entry.kept,
		}
	}

	/**
	 * add several records at once (one save)
	 * @param {string} codex
	 * @param {object[]} entries {kind, name, star?, source?, from?, at?, note?, kept?}
	 * @returns {object[]} the stored records
	 */
	addMany(codex, entries) {
		const list = this.#list(codex)
		const records = entries.map(entry => this.#make(entry))
		list.push(...records)
		if (list.length > MAX_PER_CODEX) list.splice(0, list.length - MAX_PER_CODEX)
		this.#save()
		return records
	}

	/**
	 * @param {string} codex
	 * @param {object} entry
	 * @returns {object} the stored record
	 */
	add(codex, entry) {
		return this.addMany(codex, [entry])[0]
	}

	/**
	 * records of a codex, newest first
	 * @param {string} codex
	 * @param {"items"|"curses"} [kind] only this kind
	 * @returns {object[]} copies
	 */
	entries(codex, kind) {
		const out = []
		const list = this.#list(codex)
		for (let i = list.length - 1; i >= 0; i--) {
			if (!kind || list[i].kind === kind) out.push({ ...list[i] })
		}
		return out
	}

	/**
	 * change the key, the note, or the kept flag of one record
	 * @param {string} codex
	 * @param {string} id
	 * @param {{star?: number|null, note?: string, kept?: boolean}} patch
	 * @returns {boolean} false when the record is gone or storage refused it
	 */
	update(codex, id, patch) {
		const record = this.#list(codex).find(r => r.id === id)
		if (!record) return false
		if ("star" in patch && record.kind === "items") record.star = validStar(patch.star)
		if ("note" in patch) record.note = String(patch.note)
		if ("kept" in patch) record.kept = !!patch.kept
		return this.#save()
	}

	/**
	 * mark the newest unkept record of this name as kept
	 * @param {string} codex
	 * @param {"items"|"curses"} kind
	 * @param {string} name
	 * @returns {object|null} the record, or null when no draw of that name is waiting
	 */
	markKept(codex, kind, name) {
		const list = this.#list(codex)
		for (let i = list.length - 1; i >= 0; i--) {
			if (list[i].kind === kind && list[i].name === name && !list[i].kept) {
				list[i].kept = true
				this.#save()
				return { ...list[i] }
			}
		}
		return null
	}

	/**
	 * the codex let go of an entry: clear kept on the newest kept record of that name
	 * @param {string} codex
	 * @param {"items"|"curses"} kind
	 * @param {string} name
	 */
	unmarkKept(codex, kind, name) {
		const list = this.#list(codex)
		for (let i = list.length - 1; i >= 0; i--) {
			if (list[i].kind === kind && list[i].name === name && list[i].kept) {
				list[i].kept = false
				this.#save()
				return
			}
		}
	}

	/**
	 * @param {string} codex
	 * @param {string} id
	 */
	remove(codex, id) {
		const list = this.#list(codex)
		const index = list.findIndex(r => r.id === id)
		if (index !== -1) list.splice(index, 1)
		this.#save()
	}

	/**
	 * forget every draw that was not kept
	 * @param {string} codex
	 * @returns {number} how many were removed
	 */
	clearUnkept(codex) {
		const list = this.#list(codex)
		const before = list.length
		this.#store[codex] = list.filter(r => r.kept)
		this.#save()
		return before - this.#store[codex].length
	}

	/** @param {string} codex */
	deleteCodex(codex) {
		delete this.#store[codex]
		this.#save()
	}
}
