const { instagram } = require('@jerrycoder/instagram-api');
(async () => {
    try {
        const result = await instagram('https://www.instagram.com/p/DB2BgROznfv/');
        console.log(JSON.stringify(result, null, 2));
    } catch(e) {
        console.error(e);
    }
})();
