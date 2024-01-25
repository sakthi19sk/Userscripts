// ==UserScript==
// @name        AniHIDE - Hide Unrelated Episodes
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     1.3.9
// @description Filter animes in the Home/New-Episodes pages to show only what you are watching or plan to watch based on your anime list on MAL or AL.
// @icon        https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ
// @author      Jery
// @license     MIT
// @match       https://yugenanime.*/*
// @match       https://yugenanime.tv/*
// @match       https://anitaku.*/*
// @match       https://anitaku.to/*
// @match       https://gogoanime3.*/*
// @match       https://gogoanime3.net/*
// @match       https://animepahe.*/
// @match       https://animepahe.ru/
// @match       https://animesuge.to/*
// @match       https://animesuge.*/*
// @match       https://*animesuge.cc/*
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_notification
// @require     https://unpkg.com/axios/dist/axios.min.js
// @downloadURL https://update.greasyfork.org/scripts/470233/AniHIDE%20-%20Hide%20Unrelated%20Episodes.user.js
// @updateURL https://update.greasyfork.org/scripts/470233/AniHIDE%20-%20Hide%20Unrelated%20Episodes.meta.js
// ==/UserScript==


/**************************
 * Notify new Update
***************************/
if (GM_getValue("version") != GM_info.script.version) {
    // refreshList();
    GM_setValue("version", GM_info.script.version);
    const msg = `
        ${GM_info.script.name}:\n
        This scipt has been updated!!\n
        What's new:
         -Fixed CORS Proxy issue with MAL [fix]
    `
    alert(msg);
}

/* Preferred Format sample-
What's new:
         -Added AnimePahe [website]
         -Added Timeout for certain sites [workaround]
         -Notification shown for list refresh [feature]
         -Bug Fixes + Code Cleanup`
*/

/**************************
 * CONSTANTS
***************************/
const userSettingsKey = 'userSettings';
const animeListKey = 'animeList';
const manualListKey = 'manualList';
const MALClientId = 'cfdd50f8037e9e8cf489992df497c761';


/***************************************************************
 * ANIME SITES
 * -----------
 * the timeout variable is a workaround for sites like
 * AnimePahe which generate episodes page dynamically.
 ***************************************************************/
const animeSites = [
    {
        name: 'yugenanime',
        url: ['yugenanime.tv'],
        item: '.ep-grid > li',
        title: '.ep-origin-name',
        thumbnail: '.ep-thumbnail > img',
        timeout: 0
    },
    {
        name: 'gogoanime',
        url: ['gogoanime3', 'gogoanimehd', 'gogoanime'],
        item: '.items > li',
        title: '.name > a',
        thumbnail: '.img > a > img',
        timeout: 0
    },
    {
        name: 'animepahe',
        url: ['animepahe.ru', 'animepahe.com', 'animepahe'],
        item: '.episode-wrap > .episode',
        title: '.episode-title > a',
        thumbnail: '.episode-snapshot > img',
        timeout: 500
    },
    {
        name: 'animesuge',
        url: ['animesuge.to'],
        item: '.item',
        title: '.name > a',
        thumbnail: '.poster img',
        timeout: 0
    },
    {
        name: 'animesuge',
        url: ['animesuge.cc'],
        item: '.itemlist > li',
        title: '.name a',
        thumbnail: '.poster > img',
        timeout: 0
    },
    {
        name: 'animesuge',
        url: ['animesuge.su'],
        item: '.bs',
        title: '.tt',
        thumbnail: 'img',
        timeout: 0
    }
];

const services = [
    {
        name: "MyAnimeList",
        icon: "https://image.myanimelist.net/ui/OK6W_koKDTOqqqLDbIoPAiC8a86sHufn_jOI-JGtoCQ",
        statuses: ['watching', 'plan_to_watch', 'on_hold', 'dropped', 'completed', ''],
        apiBaseUrl: 'https://api.myanimelist.net/v2/users',
        clientId: MALClientId,
        async getAnimeList(username, status) {
            const proxyUrl = 'https://test.cors.workers.dev/?'; //'https://corsproxy.io/?';
            const url = `${proxyUrl}${this.apiBaseUrl}/${username}/animelist?status=${status}&limit=1000`;
            const config = {
                headers: {
                    'X-MAL-CLIENT-ID': this.clientId
                }
            };
            const response = await axios.get(url, config);
            const data = response.data;
            return data.data.map(entry => new AnimeEntry(entry.node.title));
        }
    },
    {
        name: "AniList",
        icon: "https://anilist.co/img/icons/android-chrome-512x512.png",
        statuses: ['CURRENT', 'PLANNING', 'COMPLETED', 'DROPPED', 'PAUSED', ''],
        apiBaseUrl: 'https://graphql.anilist.co',
        async getAnimeList(username, status) {
            let page = 1, entries = [], hasNextPage = true;
            while (hasNextPage) {
                const query = `
                    query {
                        Page(page:${page}, perPage:50) {
                            pageInfo { hasNextPage, currentPage },
                            mediaList(userName:"${username}", type:ANIME, status:${status}) {
                                media { title { romaji } }
                            }
                        }
                    }
                `;
                const response = await axios.post(this.apiBaseUrl, { query });
                const data = response.data.data.Page;
                entries = entries.concat(data.mediaList);
                hasNextPage = data.pageInfo.hasNextPage;
                page = data.pageInfo.currentPage + 1;
            }
            return entries.map(entry => new AnimeEntry(entry.media.title.romaji));
        }
    },
    {
        name: "YugenAnime",
        icon: "https://yugenanime.tv/static/img/logo__light.png",
        statuses: [1, 2, 4, 5, 3],
        apiBaseUrl: 'https://yugenanime.tv/api/mylist',
        async getAnimeList(username, status) {
            const url = `${this.apiBaseUrl}/?list_status=${status}`;
            const response = await axios.get(url);
            const doc = new DOMParser().parseFromString(response.data.query, 'text/html');
            const list = Array.from(doc.querySelectorAll('.list-entry-row'), row => {
                return new AnimeEntry(row.querySelector('.list-entry-title a').textContent.trim());
            });
            return list;
        }
    }
];


/***************************************************************
 * Classes for handling various data like settings, lists,
 * services and websites
 ***************************************************************/
// User settings
class UserSettings {
    constructor(usernames = {}) {
        this.usernames = usernames;
    }
    static load() {
        return GM_getValue(userSettingsKey, new UserSettings());
    }
}

// Anime entry
class AnimeEntry {
    constructor(title) {
        this.title = title;
    }
}

// Anime list
class AnimeList {
    constructor(key) {
        this.entries = GM_getValue(key, []);
    }

    clear() {
        this.entries = [];
    }

    removeEntry(entry) {
        this.entries = this.entries.filter(e => e.title !== entry.title);
    }

    addEntry(entry) {
        this.entries.push(entry);
    }

    // Use jaro-winkler algorithm to compare whether the given title is similar present in the animelist
    isEntryExist(title) {
        const threshold = 0.8;
        const a = title.toLowerCase();
        return this.entries.some(e => {
            const b = e.title.toLowerCase(), m = a.length, n = b.length;
            if (n === 0 || m === 0) return false;
            const max = Math.floor(Math.max(n, m) / 2) - 1, ma = Array(n).fill(false), mb = Array(m).fill(false);
            let mtc = 0;
            for (let i = 0; i < n; i++) {
                const s = Math.max(0, i - max), e = Math.min(m, i + max + 1);
                for (let j = s; j < e; j++) {
                    if (!mb[j] && b[i] === a[j]) {
                        ma[i] = true, mb[j] = true, mtc++;
                        break;
                    }
                }
            }
            if (mtc === 0) return false;
            let tr = 0, k = 0;
            for (let i = 0; i < n; i++) {
                if (ma[i]) {
                    while (!mb[k]) k++;
                    if (b[i] !== a[k]) tr++;
                    k++;
                }
            }
            const sim = (mtc / n + mtc / m + (mtc - tr / 2) / mtc) / 3;
            if (sim >= 0.7) console.log(`jaro-winkler: ${b} - ${a} = ${sim}`);
            return sim >= threshold;
        });
    }
}

// Website class
class Website {
    constructor(site) {
        this.site = site;

        // Apply initial CSS styles
        GM_addStyle(`
            /* Show eps on Hover */
            ${site.item} ${site.thumbnail}:hover {
                opacity: 1 !important;
                filter: brightness(1) !important;
                transition: .2s ease-in-out !important;
            }
        `);
    }

    // Gets all the anime items on the page
    getAnimeItems() {
        return $(this.site.item);
    }

    // Gets the anime title from the anime item
    getAnimeTitle(animeItem) {
        return $(animeItem).find(this.site.title).contents().filter(function() {
            return this.nodeType === Node.TEXT_NODE;
        }).text().trim();
    }

    undarkenRelatedEps(animeList) {
        const animeItems = this.getAnimeItems();
        animeItems.each((_, animeItem) => {
            const animeTitle = this.getAnimeTitle(animeItem);
            const isRelated = animeList.isEntryExist(animeTitle);
            if (isRelated) {
                // console.log(`Anime "${animeTitle}" is related:`, isRelated);
                $(animeItem).find(this.site.thumbnail).css({
                    opacity: '1',
                    filter: 'brightness(1)',
                    transition: '.2s ease-in-out'
                });
            } else {
                $(animeItem).find(this.site.thumbnail).css({
                    opacity: '0.5',
                    filter: 'brightness(0.3)',
                    transition: '.4s ease-in-out'
                });
            }
        });
    }
}


/***************************************************************
 * Initialize all data and setup menu commands
 ***************************************************************/
// User settings
let userSettings = UserSettings.load();

// Anime list and manual list
const animeList = new AnimeList(animeListKey);
const manualList = new AnimeList(manualListKey);

// Service instance
let service = null;
chooseService(parseInt(GM_getValue('service', 1)));

// Register menu commands
GM_registerMenuCommand('Show Options', showOptions);


/***************************************************************
 * Functions for working of script
 ***************************************************************/
// Show menu options as a prompt
function showOptions() {
    let options = { 'Refresh Anime List': refreshList, 'Change Username': changeUsername, 'Manually Add/Remove Anime': modifyManualAnime, 'Choose Service': chooseService }
    let opt = prompt(
        `${GM_info.script.name}\n\nChoose an option:\n${Object.keys(options).map((key, i) => `${i + 1}. ${key}`).join('\n')}`, '1'
    )
    if (opt !== null) {
        let index = parseInt(opt) - 1
        let selectedOption = Object.values(options)[index]
        selectedOption()
    }
}

// Refresh the anime list from MAL and store it using GM_setValue
async function refreshList() {
    try {
        const username = userSettings.usernames[service.name]
        if (!username) {
            alert(`Please set your ${service.name} username to continue.`);
            changeUsername();
            return;
        }
        console.log(service);

        GM_notification("Refreshing your list...", GM_info.script.name, service.icon)

        const entriesWatching = await service.getAnimeList(username, service.statuses[0]);
        const entriesPlanned = await service.getAnimeList(username, service.statuses[1]);
        const entriesManual = manualList.entries;

        const oldAnimeList = animeList.entries.map(entry => entry.title);
        animeList.clear();
        entriesWatching.forEach(entry => animeList.addEntry(entry));
        entriesPlanned.forEach(entry => animeList.addEntry(entry));
        entriesManual.forEach(entry => manualList.addEntry(entry));
        const newAnimeList = animeList.entries.map(entry => entry.title);

        GM_setValue(animeListKey, animeList.entries);

        const removedAnime = oldAnimeList.filter(anime => !newAnimeList.includes(anime));
        const addedAnime = newAnimeList.filter(anime => !oldAnimeList.includes(anime));
        const unchangedAnime = newAnimeList.filter(anime => oldAnimeList.includes(anime));

        let output = '';
        if (removedAnime.length > 0) output += `-${removedAnime.join('\n-')}\n`;
        if (addedAnime.length > 0) output += `+${addedAnime.join('\n+')}\n`;
        output += `${unchangedAnime.join('\n')}`;

        alert(`Anime list refreshed (${newAnimeList.length - oldAnimeList.length}/${newAnimeList.length}):\n\n${output}`);
        run();
    } catch (error) {
        console.error('An error occurred while refreshing the anime list:', error);
        alert(`An error occurred while refreshing the anime list:\n\n${error}\n\n\nAlternatively, you can try to refresh the list from any other supported site and return here.\n\nSupported sites: ${animeSites.map(site => site.name).join(', ')}`);
    }
}

// Change MAL username
function changeUsername() {
    const newUsername = prompt(`Enter your ${service.name} username:`);
    if (newUsername) {
        userSettings.usernames[service.name] = newUsername;
        GM_setValue(userSettingsKey, userSettings);
        refreshList();
    }
}

// Manually add anime
function modifyManualAnime() {
    const animeTitle = prompt('This is a fallback mechanism to be used when the anime is not available on any service.\nFor both- Adding and Removing an anime, just enter the anime name.\n\nWith exact spelling, Enter the anime title:').trim();
    if (animeTitle == 'clear') { manualList.clear(); GM_setValue(manualListKey, manualList.entries); alert('Manual List Cleared'); return; }
    if (animeTitle) {
        const animeEntry = new AnimeEntry(animeTitle);
        if (manualList.isEntryExist(animeTitle)) {
            manualList.removeEntry(animeEntry);
            alert(`Anime Removed Successfully (reload page to see changes):\n\n${animeEntry.title}`);
        } else {
            manualList.addEntry(animeEntry);
            alert(`Anime Added Successfully:\n\n${animeEntry.title}`);
        }
        GM_setValue(manualListKey, manualList.entries);
        run();
    }
}

// Prompt the user to choose a service
function chooseService(ch) {
    let choice = typeof ch == 'number' ? ch : parseInt(GM_getValue('service', 1));

    if (typeof ch !== 'number') {
        const msg = `${GM_info.script.name}\n\nChoose a service:\n${services.map((s, i) => `${i + 1}. ${s.name}`).join('\n')}`;
        choice = prompt(msg, choice);
    }
    if (choice == null) { return } else choice = parseInt(choice);
    let newService = services[choice - 1];

    if (!newService) {
        console.log('Invalid choice. Switch to a different service for now.');
        return chooseService(parseInt(GM_getValue('service', 1)));
    } else service = newService;

    GM_setValue('service', choice);

    if (typeof ch !== 'number') {
        GM_notification(`Switched to ${service.name} service.`, GM_info.script.name, service.icon);
        refreshList();
    }

    console.log(`Switched to ${service.name} service.`);
    return service;
}

// Get the current website based on the URL
function getCurrentSite() {
    const currentUrl = window.location.href.toLowerCase();
    return animeSites.find(website => website.url.some(site => currentUrl.includes(site)));
}

// Run the script
run();

// Refresh the anime list if it has been more than a week since the last refresh
const lastRefreshTime = GM_getValue('lastRefreshTime', 0);
const currentTime = new Date().getTime();
const refreshInterval = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
if (currentTime - lastRefreshTime > refreshInterval) {
    refreshList();
    GM_setValue('lastRefreshTime', currentTime);
}