(function() {
    function getBaseUrl() {
        const base = (typeof manifest !== 'undefined' && manifest.baseUrl) ? manifest.baseUrl : "https://sflix.film";
        return base.replace(/\/+$/, '');
    }

    // Pakai header browser PC standar agar tidak diblokir Anti-Bot
    const commonHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8"
    };

    async function fetchGet(endpoint, extraHeaders = {}) {
        const url = `${getBaseUrl()}${endpoint}`;
        const headers = { ...commonHeaders, ...extraHeaders };

        if (typeof http_get !== 'undefined') {
            try {
                const res = await http_get(url, headers);
                // Jika sukses (200 OK)
                if (res && res.status >= 200 && res.status < 300) {
                    return JSON.parse(res.body);
                }
                // Jika diblokir (403, 503, dll), tangkap status dan isi responsenya
                throw new Error(`Status: ${res ? res.status : 'Unknown'} | Info: ${res && res.body ? res.body.substring(0, 40) : 'Kosong'}`);
            } catch (err) {
                throw new Error(`Req Gagal: ${err.message}`);
            }
        } else {
            const res = await fetch(url, { headers });
            return await res.json();
        }
    }

    async function fetchPost(endpoint, bodyObj) {
        const url = `${getBaseUrl()}${endpoint}`;
        const headers = { ...commonHeaders, "Content-Type": "application/json" };
        const bodyStr = JSON.stringify(bodyObj);

        if (typeof http_post !== 'undefined') {
            try {
                const res = await http_post(url, bodyStr, headers);
                if (res && res.status >= 200 && res.status < 300) {
                    return JSON.parse(res.body);
                }
                throw new Error(`Status POST: ${res ? res.status : 'Unknown'}`);
            } catch (err) {
                throw new Error(`POST Gagal: ${err.message}`);
            }
        } else {
            const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
            return await res.json();
        }
    }

    // --- Core Functions --- //

    async function getHome(cb) {
        try {
            const data = await fetchGet('/wefeed-h5-bff/web/ranking-list/content?id=872031290915189720&page=1&perPage=12');
            
            if (!data || !data.data || !data.data.subjectList) {
                return cb({ success: true, data: {} });
            }

            const items = data.data.subjectList.map(item => new MultimediaItem({
                title: item.title,
                url: item.subjectId,
                posterUrl: item.cover?.url,
                type: item.subjectType === 1 ? "movie" : "series",
                score: parseFloat(item.imdbRatingValue) || 0
            }));

            cb({ success: true, data: { "Trending": items } });
        } catch (e) {
            // Error ini akan muncul di layar SkyStream agar kita tahu letak masalahnya
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const body = { keyword: query, page: "1", perPage: "0", subjectType: "0" };
            const data = await fetchPost('/wefeed-h5-bff/web/subject/search', body);

            if (!data || !data.data || !data.data.items) {
                return cb({ success: true, data: [] });
            }

            const items = data.data.items.map(item => new MultimediaItem({
                title: item.title,
                url: item.subjectId,
                posterUrl: item.cover?.url,
                type: item.subjectType === 1 ? "movie" : "series",
                score: parseFloat(item.imdbRatingValue) || 0
            }));

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const data = await fetchGet(`/wefeed-h5-bff/web/subject/detail?subjectId=${url}`);
            const subject = data.data?.subject;
            const resource = data.data?.resource;

            if (!subject) return cb({ success: false, errorCode: "PARSE_ERROR" });

            const episodes = [];
            const isSeries = subject.subjectType === 2;

            if (isSeries && resource?.seasons) {
                resource.seasons.forEach(season => {
                    const eps = season.allEp 
                        ? season.allEp.split(',').map(Number) 
                        : Array.from({length: season.maxEp}, (_, i) => i + 1);
                        
                    eps.forEach(epNum => {
                        episodes.push(new Episode({
                            name: `Episode ${epNum}`,
                            url: JSON.stringify({ id: subject.subjectId, se: season.se, ep: epNum, path: subject.detailPath }),
                            season: season.se,
                            episode: epNum
                        }));
                    });
                });
            } else {
                episodes.push(new Episode({
                    name: "Movie",
                    url: JSON.stringify({ id: subject.subjectId, se: 0, ep: 0, path: subject.detailPath }),
                    season: 1,
                    episode: 1
                }));
            }

            cb({
                success: true, 
                data: new MultimediaItem({
                    title: subject.title,
                    url: subject.subjectId,
                    posterUrl: subject.cover?.url,
                    type: isSeries ? "series" : "movie",
                    year: subject.releaseDate ? parseInt(subject.releaseDate.split('-')[0]) : null,
                    description: subject.description,
                    score: parseFloat(subject.imdbRatingValue) || 0,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(dataStr, cb) {
        try {
            const { id, se, ep, path } = JSON.parse(dataStr);
            const refererUrl = `${getBaseUrl()}/spa/videoPlayPage/movies/${path}?id=${id}&type=/movie/detail&lang=en`;
            
            const data = await fetchGet(`/wefeed-h5-bff/web/subject/play?subjectId=${id}&se=${se}&ep=${ep}`, {
                "Referer": refererUrl
            });

            if (!data || !data.data || !data.data.streams) {
                return cb({ success: true, data: [] });
            }

            const streams = data.data.streams.map(s => new StreamResult({
                url: s.url,
                quality: s.resolutions || "Auto",
                headers: { "Referer": `${getBaseUrl()}/` }
            }));

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
