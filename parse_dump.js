const fs = require('fs');
const metadata = JSON.parse(fs.readFileSync('dump.json', 'utf8'));

let rejectedCount = 0;
const allVids = (metadata.formats || []).filter(f => {
    if (f.vcodec === 'none' || f.vcodec === 'mhtml' || f.vcodec === 'images' || (f.format_id && String(f.format_id).startsWith('sb'))) {
        rejectedCount++;
        return false;
    }
    return true;
});

console.log(`Total formats: ${metadata.formats ? metadata.formats.length : 0}`);
console.log(`Video formats: ${allVids.length}`);
console.log("Formats available:");
allVids.forEach(f => console.log(`${f.format_id} | ${f.width}x${f.height} | vcodec: ${f.vcodec} | acodec: ${f.acodec} | ext: ${f.ext}`));

const resolutionsToFind = [
    { minH: 360, label: '360p', rec: false },
    { minH: 480, label: '480p', rec: false },
    { minH: 720, label: '720p HD', rec: false },
    { minH: 1080, label: '1080p Full HD', rec: false },
    { minH: 1440, label: '1440p 2K', rec: false },
    { minH: 2160, label: '2160p 4K', rec: true }
];

let videoFormats = [];

resolutionsToFind.forEach(({minH, label, rec}) => {
    let maxH = 9999;
    if (minH === 1440) maxH = 2159;
    if (minH === 1080) maxH = 1439;
    if (minH === 720) maxH = 1079;
    if (minH === 480) maxH = 719;
    if (minH === 360) maxH = 479;
    if (minH === 2160) maxH = 99999;
    
    const vids = allVids.filter(f => f.height >= minH && f.height <= maxH);
    if (vids.length === 0) return;
    
    vids.sort((a,b) => (b.fps||0) - (a.fps||0) || (b.tbr||0) - (a.tbr||0) || (b.filesize||0) - (a.filesize||0));
    const f = vids[0];
    
    videoFormats.push({
        id: f.format_id || 'bestvideo',
        quality: label,
        size: '10MB' // mock
    });
});

console.log("\nVideo Formats Generated:");
console.log(videoFormats);
