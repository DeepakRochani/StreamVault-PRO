const fs = require('fs');

const metadataStr = fs.readFileSync('youtube_meta.json', 'utf8');
const metadata = JSON.parse(metadataStr);

const dur = metadata.duration || 0;
let bestAudioSize = 0;
const audios = metadata.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
audios.sort((a,b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0));
if (audios.length > 0) bestAudioSize = audios[0].filesize || audios[0].filesize_approx || 0;

let videoFormats = [];
const allVids = (metadata.formats || []).filter(f => {
    if (f.vcodec === 'none' || f.vcodec === 'mhtml' || f.vcodec === 'images' || (f.format_id && String(f.format_id).startsWith('sb'))) {
        return false;
    }
    return true;
});

const resolutionsToFind = [
    { minH: 360, label: '360p', rec: false },
    { minH: 480, label: '480p', rec: false },
    { minH: 720, label: '720p HD', rec: false },
    { minH: 1080, label: '1080p Full HD', rec: false },
    { minH: 1440, label: '1440p 2K', rec: false },
    { minH: 2160, label: '2160p 4K', rec: true }
];

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
        id: f.format_id,
        quality: label,
        resolution: `${f.width || '?'}x${f.height || minH}`,
        fps: f.fps ? `${f.fps}fps` : '',
        codec: (f.vcodec || '').split('.')[0] || 'Unknown',
        sizeStr: '...',
        recommended: rec,
    });
});
if (videoFormats.length === 0 && allVids.length > 0) {
    const bestVid = allVids[allVids.length - 1];
    videoFormats.push({
        id: bestVid.format_id || 'bestvideo',
        quality: 'Original Quality',
        resolution: bestVid.resolution || 'Unknown',
        fps: bestVid.fps ? `${bestVid.fps}fps` : '',
        codec: (bestVid.vcodec || '').split('.')[0] || 'Unknown',
        recommended: true
    });
}
videoFormats = videoFormats.filter((v,i,a)=>a.findIndex(t=>(t.quality===v.quality))===i);
videoFormats.sort((a,b) => (parseInt(a.quality) || 0) - (parseInt(b.quality) || 0));

console.log(videoFormats);
