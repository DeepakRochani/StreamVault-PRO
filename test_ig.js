const { igdl } = require('btch-downloader');
(async () => {
    try {
        const data = await igdl('https://www.instagram.com/p/DB2BgROznfv/');
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
})();
