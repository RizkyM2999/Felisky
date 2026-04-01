(function() {
    // Fungsi Fetch Helper menggunakan dynamic baseUrl 
    async function fetchApi(endpoint, options = {}) {
        const url = `${manifest.baseUrl}${endpoint}`; //
        const res = await fetch(url, options);
        return await res.json();
    }

    // 1. getHome: Mengambil kategori (Trending)
    async function getHome(cb) {
        try {
            const data = await fetchApi('/wefeed-h5-bff/web/ranking-list/content?id=872031290915189720&page=1&perPage=12');
            
            const items = (data.data?.subjectList || []).map(item => new MultimediaItem({
                title: item.title,
                url: item.subjectId,
                posterUrl: item.cover?.url,
                type: item.subjectType === 1 ? "movie" : "series", //
                score: parseFloat(item.imdbRatingValue) || 0
            }));

            cb({ success: true, data: { "Trending": items } }); //
        } catch (error) {
            cb({ success: false, error: error.message });
        }
    }

    // 2. search: Mencari film/series
    async function search(query, cb) {
        try {
            const body = JSON.stringify({ keyword: query, page: "1", perPage: "0", subjectType: "0" });
            const data = await fetchApi('/wefeed-h5-bff/web/subject/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body
            });

            const items = (data.data?.items || []).map(item => new MultimediaItem({
                title: item.title,
                url: item.subjectId,
                posterUrl: item.cover?.url,
                type: item.subjectType === 1 ? "movie" : "series",
                score: parseFloat(item.imdbRatingValue) || 0
            }));

            cb({ success: true, data: items });
        } catch (error) {
            cb({ success: false, error: error.message });
        }
    }

    // 3. load: Mengambil detail media dan daftar episode
    async function load(url, cb) {
        try {
            const data = await fetchApi(`/wefeed-h5-bff/web/subject/detail?subjectId=${url}`);
            const subject = data.data?.subject;
            const resource = data.data?.resource;

            if (!subject) throw new Error("No data found");

            const item = new MultimediaItem({
                title: subject.title,
                url: subject.subjectId,
                posterUrl: subject.cover?.url,
                type: subject.subjectType === 1 ? "movie" : "series",
                year: subject.releaseDate ? parseInt(subject.releaseDate.split('-')[0]) : null,
                description: subject.description,
                score: parseFloat(subject.imdbRatingValue) || 0
            }); //

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
                            url: `${subject.subjectId}|${season.se}|${epNum}|${subject.detailPath}`,
                            season: season.se,
                            episode: epNum
                        })); //
                    });
                });
            } else {
                episodes.push(new Episode({
                    name: "Movie",
                    url: `${subject.subjectId}|0|0|${subject.detailPath}`,
                    season: 1,
                    episode: 1
                }));
            }

            item.episodes = episodes; 
            cb({ success: true, data: item });
        } catch (error) {
            cb({ success: false, error: error.message });
        }
    }

    // 4. loadStreams: Mengambil link video
    async function loadStreams(url, cb) {
        try {
            const [subjectId, se, ep, detailPath] = url.split('|');

            // Set Referer
            const referer = `${manifest.baseUrl}/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail&lang=en`;

            const data = await fetchApi(`/wefeed-h5-bff/web/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}`, {
                headers: { 'Referer': referer }
            });

            const streams = (data.data?.streams || []).map(s => new StreamResult({
                url: s.url,
                quality: s.resolutions || "Auto",
                headers: { "Referer": `${manifest.baseUrl}/` }
            })); //

            cb({ success: true, data: streams });
        } catch (error) {
            cb({ success: false, error: error.message });
        }
    }

    // Export to SkyStream
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
