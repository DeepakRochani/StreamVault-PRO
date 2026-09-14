const { instagramGetUrl } = require("instagram-url-direct")
let links = instagramGetUrl("https://www.instagram.com/p/DB2BgROznfv/")
links.then(console.log).catch(console.error)
