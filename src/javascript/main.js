import { pageHandler } from "./pageHandler.js"

// smartSplit and arrayMerge live in utils.js; re-exported so older imports keep working
export { smartSplit, arrayMerge } from "./utils.js"

const pagePromise = pageHandler.build()

window.onload = function () {
	pagePromise.then(function (page) {
		createAllEventHandlers(page)
		page.initPage()
	})
}

/**
 * a native <dialog> closes when the click lands on its backdrop (the dialog element itself, outside its box)
 * @param {HTMLDialogElement} dialog
 */
function closeOnBackdrop(dialog) {
	dialog.addEventListener("click", (event) => {
		if (event.target !== dialog) return
		const box = dialog.getBoundingClientRect()
		const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
		if (!inside) dialog.close()
	})
}

/**
 * wire every control on the page to the pageHandler. element ids live in index.html.
 * @param {pageHandler} page
 */
function createAllEventHandlers(page) {

	// pages: nav buttons, the brand mark, hero and card buttons, inline links, and the url hash
	for (let button of document.querySelectorAll("[data-tab]")) {
		button.addEventListener("click", () => {
			if (button.hasAttribute("data-close-options")) pageHandler.closeOptions()
			page.changeTabTo(button.dataset.tab)
		})
	}
	window.addEventListener("hashchange", () => { page.hashChangeListener() })

	// header
	document.getElementById("themeToggle").addEventListener("click", () => { page.toggleTheme() })
	document.getElementById("optionsButton").addEventListener("click", () => { pageHandler.openOptions() })

	// options dialog
	const options = document.getElementById("optionsMenu")
	document.getElementById("optionsClose").addEventListener("click", () => { pageHandler.closeOptions() })
	closeOnBackdrop(options)
	for (let button of document.querySelectorAll("[data-theme-choice]")) {
		button.addEventListener("click", () => { page.setTheme(button.dataset.themeChoice) })
	}
	document.getElementById("optionsBackgroundToggle").addEventListener("change", (e) => { page.backgroundImageOptionChangeListener(e) })

	// content switches, in Options and on the Draw panel
	for (let button of document.querySelectorAll("[data-content-mode]")) {
		button.addEventListener("click", () => { page.setContentMode(button.dataset.contentMode) })
	}

	// detail dialog
	const detail = document.getElementById("detailDialog")
	document.getElementById("detailClose").addEventListener("click", () => { detail.close() })
	closeOnBackdrop(detail)

	// draw page
	for (let button of document.querySelectorAll("[data-draw-mode]")) {
		button.addEventListener("click", () => { page.setDrawMode(button.dataset.drawMode) })
	}
	for (let button of document.querySelectorAll(".key-pick")) {
		button.addEventListener("click", () => { page.setTicket(button.dataset.star) })
	}
	const itemCategoriesFilters = Array.from(document.querySelectorAll("#itemsCategoryFilter input"))
	const allCategoryBox = itemCategoriesFilters.splice(0, 1)[0]
	for (let checkbox of itemCategoriesFilters) {
		checkbox.addEventListener("change", (e) => { page.categoryFilterChangeListener(e) })
	}
	allCategoryBox.addEventListener("change", (e) => { page.categoryFilterAllChangeListener(e) })
	document.getElementById("itemRollButton").addEventListener("click", () => { page.roll("items") })
	document.getElementById("cursesRollButton").addEventListener("click", () => { page.roll("curses") })

	// codex page: codices, the character sheet (saves as you type), the portrait file input
	document.getElementById("codexSelector").addEventListener("change", (e) => { page.switchBuildEventHandler(e) })
	const newName = document.getElementById("codexNewName")
	newName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); page.createNewBuild(newName) } })
	document.getElementById("codexNewButton").addEventListener("click", () => { page.createNewBuild(newName) })
	document.getElementById("codexDeleteButton").addEventListener("click", () => { page.deleteCurrentBuildListener() })
	for (let field of document.querySelectorAll("[data-profile]")) {
		field.addEventListener("input", (e) => { page.profileFieldListener(e) })
	}
	document.getElementById("portraitInput").addEventListener("change", (e) => { page.portraitChangeListener(e.target.files[0]); e.target.value = "" })
	document.getElementById("portraitClear").addEventListener("click", () => { page.portraitClear() })
	document.getElementById("buildExportButton").addEventListener("click", () => { page.exportSaved() })

	// codex ledger: which kind, kept only, forget the rest
	for (let button of document.querySelectorAll("[data-ledger-view]")) {
		button.addEventListener("click", () => { page.setLedgerFilter({ view: button.dataset.ledgerView }) })
	}
	document.getElementById("ledgerKeptOnly").addEventListener("change", (e) => { page.setLedgerFilter({ keptOnly: e.target.checked }) })
	document.getElementById("ledgerClearButton").addEventListener("click", () => { page.clearUnkeptLedger() })

	// catalogue: forms submit on Enter or the button, the switch picks scrolls or curses
	document.getElementById("searchItemsOptions").addEventListener("submit", (e) => { e.preventDefault(); page.searchSubmitListener(e.currentTarget, "items") })
	document.getElementById("searchCursesOptions").addEventListener("submit", (e) => { e.preventDefault(); page.searchSubmitListener(e.currentTarget, "curses") })
	for (let button of document.querySelectorAll("[data-search]")) {
		button.addEventListener("click", () => { page.setSearchSection(button.dataset.search) })
	}

	// guide: contents links scroll within the page instead of changing the hash (the hash names the page)
	for (let link of document.querySelectorAll(".guide-toc a")) {
		link.addEventListener("click", (e) => {
			e.preventDefault()
			const target = document.querySelector(link.getAttribute("href"))
			if (target) target.scrollIntoView({ behavior: "smooth", block: "start" })
		})
	}
};
