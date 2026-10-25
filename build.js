require('dotenv').config({ path: '.env'});
require('url').URL

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const https = require('https')

//setup get request
// the sheet to pull from and the API key both come from the environment (.env locally, secrets on CI)
const spreadsheetID = process.env.SHEETID
if (!spreadsheetID || !process.env.SHEETSAPIKEY) {
    console.error("Set SHEETID (the Google Sheet id) and SHEETSAPIKEY (a Sheets API key) in .env or the environment.")
    process.exit(1)
}
const ranges = ["\'Item List\'!A:AG"
    ,"\'Curses\'!A:H"]

const url = encodeURI(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetID}/values:batchGet?key=${process.env.SHEETSAPIKEY}&ranges=${ranges[0]}&ranges=${ranges[1]}`)
var result = ""

//define functions

// function for filter to call
function filterData(value, index, array) {
    if( value.at(21) == "FALSE"){
        return false;
    }
    else return true;
}

// with json gotten, parse, filter, create, and save new json file.
function buildData() {
    result = JSON.parse(result);
    console.log("Finished API Request")

    var itemsData = result.valueRanges[0].values.filter(filterData);
    // the Curses sheet has trailing blank rows; keep only rows with a name
    var cursesData = result.valueRanges[1].values.filter(function (row) { return row[0] && row[0].trim() !== "" })

    
    //remove header values
    itemsData.splice(0, 1)
    cursesData.splice(0, 1)
    
    console.log(`final data obtained.\nItems: ${itemsData.length}\nCurses: ${cursesData.length}`)
    
    //item 13 stats.
    //needs to be a number.
    //skip header
    for(var i = 1; i < itemsData.length;i++){
        itemsData[i][13] = itemsData[i][13].replace(/,/g, "")
        itemsData[i][13] = parseInt(itemsData[i][13])
    }

    var finalJson = JSON.stringify({
        items: itemsData,
        curses: cursesData
    });
    //overwrite is desireable. Files shouldn't be tracked as they will be built when the site deploys.
    fs.writeFile('src/data/values.json', finalJson, callback)
}

//minor error handling in file write
function callback(err){
    if (err){ 
        console.log(err)
        //finish anything left, exit gracefully with error code.
        process.exitCode = 1
    }
}

//get data from sheet
console.log("Quereying API")
https.get({
    hostname: 'sheets.googleapis.com',
    path: url
}, (res) => {

    res.on('data', (chunk) => {
        result += chunk;
    });

    res.on('end', buildData);
});
