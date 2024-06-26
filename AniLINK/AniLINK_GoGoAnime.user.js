// ==UserScript==
// @name        AniLINK: GoGoAnime
// @namespace   https://greasyfork.org/en/users/781076-jery-js
// @version     3.2.0
// @description Stream or download your favorite anime series effortlessly with AniLINK for GoGoAnime! Unlock the power to play any anime series directly in your preferred video player or download entire seasons in a single click using popular download managers like IDM. AniLINK generates direct download links for all episodes, conveniently sorted by quality. Elevate your anime-watching experience now!
// @icon        https://www.google.com/s2/favicons?domain=anitaku.to
// @author      Jery
// @license     MIT
// @match       https://anitaku.*/*
// @match       https://anitaku.to/*
// @match       https://gogoanime.*/*
// @match       https://gogoanime3.co/*
// @match       https://gogoanime3.*/*
// @match       https://animepahe.*/play/*
// @match       https://animepahe.ru/play/*
// @match       https://animepahe.com/play/*
// @match       https://animepahe.org/play/*
// @grant       GM_registerMenuCommand
// ==/UserScript==

class Episode {
    constructor(number, title, links, thumbnail) {
        this.number = number;
        this.title = title;
        this.links = links;
        this.thumbnail = thumbnail;
        this.name = `${this.title} - ${this.number}`;
    }
}

const websites = [
    {
        name: 'GoGoAnime',
        url: ['anitaku.to/', 'gogoanime3.co/', 'gogoanime3', 'anitaku', 'gogoanime'],
        epLinks: '#episode_related > li > a',
        epTitle: '.title_name > h2',
        linkElems: '.cf-download > a',
        thumbnail: '.headnav_left > a > img',
        addStartButton: function() {
            const button = document.createElement('a');
            button.id = "AniLINK_startBtn";
            button.style.cssText = `cursor: pointer; background-color: #145132;`;
            button.innerHTML = '<i class="icongec-dowload"></i> Generate Download Links';
            button.addEventListener('click', extractEpisodes);

            // Add the button to the page if user is logged in otherwise show placeholder
            if (document.querySelector('.cf-download')) {
                document.querySelector('.cf-download').appendChild(button);
            } else {
                const loginMessage = document.querySelector('.list_dowload > div > span');
                loginMessage.innerHTML = `<b style="color:#FFC119;">AniLINK:</b> Please <a href="/login.html" title="login"><u>log in</u></a> to be able to batch download animes.`;
            }
        },
        extractEpisodes: async function (status) {
            status.textContent = 'Starting...';
            let episodes = {};
            const episodePromises = Array.from(document.querySelectorAll(this.epLinks)).map(async epLink => {
                const response = await fetchHtml(epLink.href);
                const page = (new DOMParser()).parseFromString(response, 'text/html');
                
                const [, epTitle, epNumber] = page.querySelector(this.epTitle).textContent.match(/(.+?) Episode (\d+)(?:.+)$/);
                const episodeTitle = `${epNumber.padStart(3, '0')} - ${epTitle}`;
                const thumbnail = page.querySelector(this.thumbnail).src;
                const links = [...page.querySelectorAll(this.linkElems)].reduce((obj, elem) => ({ ...obj, [elem.textContent.trim()]: elem.href }), {});
                status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, '0')}...`;

                episodes[episodeTitle] = new Episode(epNumber.padStart(3, '0'), epTitle, links, thumbnail);
            });
            await Promise.all(episodePromises);
            return episodes;
        }
    },
    {
        name: 'AnimePahe', 
        url: ['animepahe.ru', 'animepahe.com', 'animepahe.org', 'animepahe'],
        epLinks: '.dropup.episode-menu .dropdown-item',
        epTitle: '.theatre-info > h1',
        linkElems: '#resolutionMenu > button',
        thumbnail: '.theatre-info > a > img',
        addStartButton: null,
        extractEpisodes: async function (status) {
            status.textContent = 'Starting...';
            let episodes = {};
            const episodePromises = Array.from(document.querySelectorAll(this.epLinks)).map(async epLink => {
                const response = await fetchHtml(epLink.href);
                const page = (new DOMParser()).parseFromString(response, 'text/html');
                
                const [, epTitle, epNumber] = page.querySelector(this.epTitle).outerText.split(/Watch (.+) - (\d+) Online$/);
                const episodeTitle = `${epNumber.padStart(3, '0')} - ${epTitle}`;
                const thumbnail = page.querySelector(this.thumbnail).src;
                status.textContent = `Extracting ${epTitle} - ${epNumber.padStart(3, "0")}...`;

                async function getVideoUrl(kwikUrl) {
                    const response = await fetch(kwikUrl, { headers: { "Referer": "https://animepahe.com" } });
                    const data = await response.text();
                    return eval(/(eval)(\(f.*?)(\n<\/script>)/s.exec(data)[2].replace("eval", "")).match(/https.*?m3u8/)[0];
                }
                let links = {};
                for (const elm of [...page.querySelectorAll(this.linkElems)]) {
                    links[elm.textContent] = await getVideoUrl(elm.getAttribute('data-src'));
                }

                episodes[episodeTitle] = new Episode(epNumber.padStart(3, '0'), epTitle, links, thumbnail);
            });
            await Promise.all(episodePromises);
            console.log(episodes);
            return episodes;
        },
        styles: `div#AniLINK_LinksContainer { font-size: 10px; } #Quality > b > div > ul {font-size: 16px;}`
    }
];

async function fetchHtml(url) {
    const response = await fetch(url);
    if (response.ok) {
        return response.text();
    } else {
        alert(`Failed to fetch HTML for ${url}`);
        throw new Error(`Failed to fetch HTML for ${url}`);
    }
}

GM_registerMenuCommand('Extract Episodes', extractEpisodes);

// initialize
console.log('Initializing AniLINK...');
const site = websites.find(site => site.url.some(url => window.location.href.includes(url)));

// attach button to page
site.addStartButton();

// append site specific css styles
document.body.style.cssText += (site.styles || '');

// This function creates an overlay on the page and displays a list of episodes extracted from a website.
// The function is triggered by a user command registered with `GM_registerMenuCommand`.
// The episode list is generated by calling the `extractEpisodes` method of a website object that matches the current URL.
async function extractEpisodes() {
    // Restore last overlay if it exists
    if (document.getElementById("AniLINK_Overlay")) {
        document.getElementById("AniLINK_Overlay").style.display = "flex";
        return;
    }

    // Create an overlay to cover the page
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "AniLINK_Overlay";
    overlayDiv.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); z-index: 999; display: flex; align-items: center; justify-content: center;";
    document.body.appendChild(overlayDiv);
    overlayDiv.onclick = event => linksContainer.contains(event.target) ? null : overlayDiv.style.display = "none";

    // Create a form to display the Episodes list
    const linksContainer = document.createElement('div');
    linksContainer.id = "AniLINK_LinksContainer";
    linksContainer.style.cssText = "position:relative; height:70%; width:60%; color:cyan; background-color:#0b0b0b; overflow:auto; border: groove rgb(75, 81, 84); border-radius: 10px; padding: 10px 5px; resize: both; scrollbar-width: thin; scrollbar-color: cyan transparent; display: flex; justify-content: center; align-items: center;";
    overlayDiv.appendChild(linksContainer);

    // Create a progress bar to display the progress of the episode extraction process
    const statusBar = document.createElement('span');
    statusBar.id = "AniLINK_StatusBar";
    statusBar.textContent = "Extracting Links..."
    statusBar.style.cssText = "background-color: #0b0b0b; color: cyan;";
    linksContainer.appendChild(statusBar);

    // Extract episodes
    const episodes = await site.extractEpisodes(statusBar);

    console.log(episodes);

    // Get all links into format - {[qual1]:[ep1,2,3,4], [qual2]:[ep1,2,3,4], ...}
    const sortedEpisodes = Object.values(episodes).sort((a, b) => a.number - b.number);
    const sortedLinks = sortedEpisodes.reduce((acc, episode) => {
        for (let quality in episode.links) (acc[quality] ??= []).push(episode);
        return acc;
    }, {});
    console.log('sorted', sortedLinks);


    const qualityLinkLists = Object.entries(sortedLinks).map(([quality, episode]) => {
        const listOfLinks = episode.map(ep => {
            return `<li id="EpisodeLink" style="list-style-type: none;">
                      <span style="user-select:none; color:cyan;">
                      Ep ${ep.number.replace(/^0+/, '')}: </span>
                      <a title="${ep.title.replace(/[<>:"/\\|?*]/g, '')}" download="${encodeURI(ep.name)}.mp4" href="${ep.links[quality]}" style="color:#FFC119;">
                      ${ep.links[quality]}</a>
                  </li>`;
        }).join("");

        return `<ol style="white-space: nowrap;">
                      <span id="Quality" style="display:flex; justify-content:center; align-items:center;">
                        <b style="color:#58FFA9; font-size:25px; cursor:pointer; user-select:none;">
                          -------------------${quality}-------------------\n
                        </b>
                      </span>
                      ${listOfLinks}
                    </ol><br><br>`;
    });

    // Update the linksContainer with the finally generated links under each quality option header
    linksContainer.style.cssText = "position:relative; height:70%; width:60%; color:cyan; background-color:#0b0b0b; overflow:auto; border: groove rgb(75, 81, 84); border-radius: 10px; padding: 10px 5px; resize: both; scrollbar-width: thin; scrollbar-color: cyan transparent;";
    linksContainer.innerHTML = qualityLinkLists.join("");

    // Add hover event listeners to update link text on hover
    linksContainer.querySelectorAll('#EpisodeLink').forEach(element => {
        const episode = element.querySelector('a');
        const link = episode.href;
        const name = decodeURIComponent(episode.download);
        element.addEventListener('mouseenter', () => window.getSelection().isCollapsed && (episode.textContent = name));
        element.addEventListener('mouseleave', () => episode.textContent = decodeURIComponent(link));
    });

    // Add hover event listeners to quality headers to transform them into speed dials
    document.querySelectorAll('#Quality b').forEach(header => {
        const style = `style="background-color: #00A651; padding: 5px 10px; border: none; border-radius: 5px; cursor: pointer; user-select: none;"`
        const sdHTML = `
            <div style="display: flex; justify-content: center; padding: 10px;">
                <ul style="list-style: none; display: flex; gap: 10px;">
                    <button type="button" ${style} id="AniLINK_selectLinks">Select</button>
                    <button type="button" ${style} id="AniLINK_copyLinks">Copy</button>
                    <button type="button" ${style} id="AniLINK_exportLinks">Export</button>
                    <button type="button" ${style} id="AniLINK_playLinks">Play with VLC</button>
                </ul>
            </div>`

        let headerHTML = header.innerHTML;
        header.parentElement.addEventListener('mouseenter', () => (header.innerHTML = sdHTML, attachBtnClickListeners()));
        header.parentElement.addEventListener('mouseleave', () => (header.innerHTML = headerHTML));
    });

    // Attach click listeners to the speed dial buttons
    function attachBtnClickListeners() {
        const buttonIds = [
            { id: 'AniLINK_selectLinks', handler: onSelectBtnPressed },
            { id: 'AniLINK_copyLinks', handler: onCopyBtnClicked },
            { id: 'AniLINK_exportLinks', handler: onExportBtnClicked },
            { id: 'AniLINK_playLinks', handler: onPlayBtnClicked }
        ];

        buttonIds.forEach(({ id, handler }) => {
            const button = document.querySelector(`#${id}`);
            button.addEventListener('click', () => handler(button));
        });

        // Select Button click event handler
        function onSelectBtnPressed(it) {
            const links = it.closest('ol').querySelectorAll('li');
            const range = new Range();
            range.selectNodeContents(links[0]);
            range.setEndAfter(links[links.length - 1]);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            it.textContent = 'Selected!!';
            setTimeout(() => { it.textContent = 'Select'; }, 1000);
        }

        // copySelectedLinks click event handler
        function onCopyBtnClicked(it) {
            const links = it.closest('ol').querySelectorAll('li');
            const string = [...links].map(link => link.children[1].href).join('\n');
            navigator.clipboard.writeText(string);
            it.textContent = 'Copied!!';
            setTimeout(() => { it.textContent = 'Copy'; }, 1000);
        }

        // exportToPlaylist click event handler
        function onExportBtnClicked(it) {
            // Export all links under the quality header into a playlist file
            const links = it.closest('ol').querySelectorAll('li');
            let string = '#EXTM3U\n';
            links.forEach(link => {
                const episode = decodeURIComponent(link.children[1].download);
                string += `#EXTINF:-1,${episode}\n` + link.children[1].href + '\n';
            });
            const fileName = links[0].querySelector('a').title + '.m3u';
            const file = new Blob([string], { type: 'application/vnd.apple.mpegurl' });
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: fileName });
            a.click();
            it.textContent = 'Exported!!';
            setTimeout(() => { it.textContent = 'Export'; }, 1000);
        }

        // PlayWithVLC click event handler
        function onPlayBtnClicked(it) {
            // Export all links under the quality header into a playlist file
            const links = it.closest('ol').querySelectorAll('li');
            let string = '#EXTM3U\n';
            links.forEach(link => {
                const episode = decodeURIComponent(link.children[1].download);
                string += `#EXTINF:-1,${episode}\n` + link.children[1].href + '\n';
            });
            const file = new Blob([string], { type: 'application/vnd.apple.mpegurl' });
            const fileUrl = URL.createObjectURL(file);
            window.open(fileUrl);
            it.textContent = 'Launching VLC!!';
            setTimeout(() => { it.textContent = 'Play with VLC'; }, 2000);
            alert("Due to browser limitations, there is a high possibility that this feature may not work correctly.\nIf the video does not automatically play, please utilize the export button and manually open the playlist file manually.");
        }

        return {
            onSelectBtnPressed,
            onCopyBtnClicked,
            onExportBtnClicked,
            onPlayBtnClicked
        };
    }
}