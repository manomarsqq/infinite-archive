export { gachaTerm }

/**
 * a superclass for gachaItem & gachaCurse due to a certain amount of shared functionality
 * do not attempt to actually use it
 */
class gachaTerm{
	/**
	 * some amount of keys with values of one of those types.
	 * @type {{
	 *  "key": string|boolean|number,
	 * }}
	 */
	#values

	constructor(values){
		this.#values = values
	}

	/**
	 *
	 * @param {string} key
	 * @returns {string|number|boolean} value of that key
	 */
	get(key){
		return this.#values[key]
	}

	/**
	 *
	 * @param {string} key
	 * @param {string|number|boolean} value value to set
	 * @returns {string|number|boolean} value
	 */
	set(key, value){
		this.#keyValueMatchCheck(key, value)
		return this.#values[key] = value
	}

	/**
	 * every key this term holds, in column order
	 * @returns {string[]}
	 */
	keys(){
		return Object.keys(this.#values)
	}

	/**
	 * throws a type error if values[key] type isn't the same as provided value
	 * @param {string} key
	 * @param {string|number|boolean} value
	 */
	#keyValueMatchCheck(key, value){
		const keyType = typeof this.#values[key]
		const valueType = typeof value
		if(keyType != valueType) throw new TypeError(`given value type "${valueType}" does not match resolved key value "${keyType}"`);
	}

	/**
	 *
	 * @param {gachaTerm[]} termArray
	 * @returns {string[]}
	 */
	static toNameArray(termArray){
		const nameArray = []
		for(let term of termArray){
			nameArray.push(term.get("name"))
		}
		return nameArray
	}

	/**
	 * given a name of item or curse, return the term with that name
	 * if passed argument is not a string, assume it's already a term, and return it (backwards compatibility with old saves)
	 * if name is not found return undefined, so callers can drop entries that no longer exist in the sheet
	 * @param {string} name
	 * @param {gachaTerm[]} rawTerms
	 * @returns {gachaTerm|undefined} Term that matches the name.
	*/
	static nameToFull(name, rawTerms) {
		if (typeof name != "string") return name;

		for (let term of rawTerms) {
			if (term.get("name") == name) return term;
		}

		console.warn(`"${name}" not found in the current data, dropping it from the build`);
		return undefined;
	}
}
