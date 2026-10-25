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
 * wire every control on the page to the pageHandler. element ids live in index.html.
 * @param {pageHandler} page
 */
function createAllEventHandlers(page) {

	// tabs: taskbar buttons, window close buttons, hero buttons, inline links, and the url hash
	for (let button of document.querySelectorAll("[data-tab]")) {
		button.addEventListener("click", () => { page.changeTabTo(button.dataset.tab) })
	}
	window.addEventListener("hashchange", () => { page.hashChangeListener() })

	// options dialog
	document.getElementById("optionsButton").addEventListener("click", () => { pageHandler.openOptions() })
	document.getElementById("optionsClose").addEventListener("click", () => { pageHandler.closeOptions() })
	document.getElementById("optionsOk").addEventListener("click", () => { pageHandler.closeOptions() })
	document.getElementById("drawerBackdrop").addEventListener("click", () => { pageHandler.closeOptions() })
	document.addEventListener("keydown", (e) => { if (e.key === "Escape") { pageHandler.closeOptions(); page.closePopovers() } })

	document.getElementById("contentOptions").addEventListener("change", (e) => { page.contentOptionsChangeListener(e) })
	document.getElementById("optionsBackgroundToggle").addEventListener("change", (e) => { page.backgroundImageOptionChangeListener(e) })
	document.getElementById("optionsThemeSelector").addEventListener("change", (e) => { page.themeChangeListener(e) })
	document.getElementById("optionsBuildSelector").addEventListener("change", (e) => { page.switchBuildEventHandler(e) })
	document.getElementById("optionsBuildsNewName").addEventListener("keydown", (e) => { page.createNewBuildEventHandler(e) })
	document.getElementById("optionsBuildsDeleteButton").addEventListener("click", () => { page.deleteCurrentBuildListener() })

	// item machine
	document.getElementById("itemRollButton").addEventListener("click", () => { page.roll("items") })
	document.getElementById("saveButton").addEventListener("click", () => { page.saveLatest("items") })
	document.getElementById("copyButton").addEventListener("click", () => { page.copyLatest("items") })
	document.getElementById("starLvlButton").addEventListener("click", () => { page.togglePopover("starPopover") })
	document.getElementById("categoryButton").addEventListener("click", () => { page.togglePopover("categoryPopover") })
	document.getElementById("filtersButton").addEventListener("click", () => { pageHandler.openOptions() })
	document.getElementById("adjustButton").addEventListener("click", () => { pageHandler.openOptions() })
	for (let light of document.querySelectorAll(".hotspot.light")) {
		light.addEventListener("click", () => { page.setContentMode(light.dataset.mode) })
	}
	for (let button of document.querySelectorAll("#starPopover .token-pick")) {
		button.addEventListener("click", () => { page.setTicket(button.dataset.star) })
	}
	const itemCategoriesFilters = Array.from(document.querySelectorAll("#itemsCategoryFilter input"))
	const allCategoryBox = itemCategoriesFilters.splice(0, 1)[0]
	for (let checkbox of itemCategoriesFilters) {
		checkbox.addEventListener("change", (e) => { page.categoryFilterChangeListener(e) })
	}
	allCategoryBox.addEventListener("change", (e) => { page.categoryFilterAllChangeListener(e) })
	// popovers close on a click anywhere else on the page
	document.addEventListener("click", (e) => {
		if (!e.target.closest(".popover, #starLvlButton, #categoryButton")) page.closePopovers()
	})

	// curse machine
	document.getElementById("cursesRollButton").addEventListener("click", () => { page.roll("curses") })
	document.getElementById("cursesSaveButton").addEventListener("click", () => { page.saveLatest("curses") })

	// build tab
	document.getElementById("buildExportButton").addEventListener("click", () => { page.exportSaved() })
	document.getElementById("buildManageButton").addEventListener("click", () => { pageHandler.openOptions() })

	// search: forms submit on Enter or the button, sub-tabs switch the section
	document.getElementById("searchItemsOptions").addEventListener("submit", (e) => { e.preventDefault(); page.searchSubmitListener(e.currentTarget, "items") })
	document.getElementById("searchCursesOptions").addEventListener("submit", (e) => { e.preventDefault(); page.searchSubmitListener(e.currentTarget, "curses") })
	for (let button of document.querySelectorAll("[data-search]")) {
		button.addEventListener("click", () => {
			for (let b of document.querySelectorAll("[data-search]")) b.classList.toggle("active", b === button)
			for (let section of document.querySelectorAll(".searchSections")) section.classList.toggle("active", section.id === button.dataset.search)
		})
	}
};
