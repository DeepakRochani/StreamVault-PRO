(async () => {
    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'SteamVaultPro/1.0'
            },
            body: JSON.stringify({
                url: 'https://www.instagram.com/p/DB2BgROznfv/',
                vQuality: 'max',
                isAudioOnly: false
            })
        });
        
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch(e) {
        console.error(e);
    }
})();
