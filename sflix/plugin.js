(function() {
    // Helper untuk GET request menggunakan native http_get app
    async function fetchApiGet(endpoint, customHeaders = {}) {
        const url = `${manifest.baseUrl}${endpoint}`;
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
            ...customHeaders
        };

        // Menggunakan http_get bawaan SkyStream jika tersedia
        if (typeof http_get !== 'undefined') {
            const res = await http_get(url, headers);
            if (res && res.status === 200) {
                return JSON.parse(res.body);
            }
            throw new Error(`HTTP Error: ${res ? res.status : 'Unknown'}`);
        } else {
            // Fallback untuk CLI test
            const res = await fetch(url, { headers });
            return await res.json();
        }
    }

    // Helper untuk POST request (Fungsi Search)
    async function fetchApiPost(endpoint, bodyObj) {
        const url = `${manifest.baseUrl}${endpoint}`;
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/json"
        };
        const bodyStr = JSON.stringify(bodyObj);

        if (typeof http_post !== 'undefined') {
            const res = await http_post(url, bodyStr, headers);
            if (res && res.status === 200) return JSON.parse(res.body);
            throw new Error("POST Error");
        } else {
            const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
            return await res.json();
        }
    }

    // 1. getHome
    async function getHome(cb) {
        try {
            const data = await fetchApiGet('/wefeed-h5-bff/web/ranking-list/content?id=872031290915189720&page=1&perPage=12');
            
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
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message }); //
        }
    }

    // 2. search
    async function search(query, cb) {
        try {
            const body = { keyword: query, page: "1", perPage: "0", subjectType: "0" };
            const data = await fetchApiPost('/wefeed-h5-bff/web/subject/search', body);

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

    // 3. load
    async function load(url, cb) {
        try {
            const data = await fetchApiGet(`/wefeed-h5-bff/web/subject/detail?subjectId=${url}`);
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
                        // Simpan data stream sebagai JSON string agar mudah diekstrak di loadStreams
                        const streamData = JSON.stringify({
                            subjectId: subject.subjectId,
                            se: season.se,
                            ep: epNum,
                            detailPath: subject.detailPath
                        });

                        episodes.push(new Episode({
                            name: `Episode ${epNum}`,
                            url: streamData,
                            season: season.se,
                            episode: epNum
                        }));
                    });
                });
            } else {
                const streamData = JSON.stringify({
                    subjectId: subject.subjectId,
                    se: 0,
                    ep: 0,
                    detailPath: subject.detailPath
                });

                episodes.push(new Episode({
                    name: "Movie",
                    url: streamData,
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

    // 4. loadStreams
    async function loadStreams(dataStr, cb) {
        try {
            // Ekstrak data dari JSON string yang dikirim oleh fungsi load
            const streamData = JSON.parse(dataStr);
            const { subjectId, se, ep, detailPath } = streamData;

            const refererUrl = `${manifest.baseUrl}/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail&lang=en`;
            
            // Tambahkan Header Referer ke native HTTP client
            const data = await fetchApiGet(`/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}`, {
                "Referer": refererUrl
            });

            if (!data || !data.data || !data.data.streams) {
                return cb({ success: true, data: [] });
            }

            const streams = data.data.streams.map(s => new StreamResult({
                url: s.url,
                quality: s.resolutions || "Auto",
                headers: { "Referer": `${manifest.baseUrl}/` }
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
