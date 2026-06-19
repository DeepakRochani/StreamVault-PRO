const db = require('./database.js');
try {
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE status = "active"').get().c;
    const dlToday = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE date(download_date) = date('now')").get().c;
    const dlMonth = db.prepare("SELECT COUNT(*) as c FROM download_history WHERE strftime('%Y-%m', download_date) = strftime('%Y-%m', 'now')").get().c;
    const cvToday = db.prepare("SELECT COUNT(*) as c FROM conversion_history WHERE date(conversion_date) = date('now')").get().c;
    const cvMonth = db.prepare("SELECT COUNT(*) as c FROM conversion_history WHERE strftime('%Y-%m', conversion_date) = strftime('%Y-%m', 'now')").get().c;
    const ytDl = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE platform = "YouTube"').get().c;
    const igDl = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE platform = "Instagram"').get().c;
    const fbDl = db.prepare('SELECT COUNT(*) as c FROM download_history WHERE platform = "Facebook"').get().c;
    const topDays = db.prepare("SELECT date(download_date) as d, COUNT(*) as c FROM download_history GROUP BY date(download_date) ORDER BY c DESC LIMIT 5").all();
    console.log("SUCCESS!");
} catch (err) {
    console.error("ERROR:", err.message);
}
