export {
	smartSplit,
	arrayMerge,
	toast,
	copyToClipboard
};

/**
 *  string.split() method does not respect split string exlusion based on quote
 * 	this function will works similar to .split(), but will ignore anything in "quotes"
 *  This function could likely be further optimized
 *
 * @param {string} input
 * @param {string} split character to split on
 * @returns {string[]} split array
 */
function smartSplit(input, split) {

	var insideQuote = false;
	var splitArray = input.split("");
	var finalArray = [""]
	var index = 0;

	for (let char of splitArray) {
		if (char == '\"') {
			insideQuote = !insideQuote;
			continue;
		}
		if (char == split && !insideQuote) {
			finalArray.push("");
			index++
		}
		else {
			finalArray[index] += char;
		}
	}
	return finalArray
}

/**
 * image the array, as an array of sets. They aren't but its useful
 * this function finds the union of those sets without duplicates
 * uses recursion call stack equal to the amount of sets - 1
 * does not preserve ordering
 * @param {*[][]} sourceArrays
 * @returns {*[]}
 */
function arrayMerge(sourceArrays) {
	//recursive base statement
	if (sourceArrays.length == 1) return sourceArrays[0];

	//get first two arrays
	var subArray1 = sourceArrays[0];
	var subArray2 = sourceArrays[1];

	//trim shared elements out of subArray2 (a Set keeps this linear on large result sets)
	const seen = new Set(subArray1)
	subArray2 = subArray2.filter(function (element) {
		return !seen.has(element);
	});

	//merge elements and place back in source.
	subArray1 = subArray1.concat(subArray2);
	sourceArrays.splice(0, 2, subArray1);
	//enter recursion
	return arrayMerge(sourceArrays);
}

let toastTimer
/**
 * show a short notice in the XP-style balloon above the taskbar tray (#toast in index.html)
 * @param {string} message
 * @param {string} [title] bold first line, defaults to "Infinite Archive"
 */
function toast(message, title = "Infinite Archive") {
	const element = document.getElementById("toast")
	if (!element) return
	element.querySelector(".toast-title").textContent = title
	element.querySelector(".toast-body").textContent = message
	element.classList.add("show")
	clearTimeout(toastTimer)
	toastTimer = setTimeout(() => element.classList.remove("show"), 2600)
}

/**
 * copy text and confirm with a toast
 * @param {string} text
 * @param {string} what what was copied, for the toast
 */
function copyToClipboard(text, what = "Text") {
	if (!navigator.clipboard) return
	navigator.clipboard.writeText(text).then(() => toast(`${what} copied to the clipboard`))
}
