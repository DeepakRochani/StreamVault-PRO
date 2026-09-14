const fs = require('fs');
const metadata = JSON.parse(fs.readFileSync('scratch/metadata_8k.json', 'utf8'));

let sizes = { v8k: null, v4k: null, v1080: null, v720: null, a320: null, a256: null, a128: null };
let bestAudioSize = 0;
let videoFormats = [];
let audioFormats = [];

const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const suffix = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + suffix[i];
};

if (metadata.formats) {
    const audios = metadata.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
    audios.sort((a,b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0));
    if (audios.length > 0) bestAudioSize = audios[0].filesize || audios[0].filesize_approx || 0;

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
        { minH: 2160, label: '2160p 4K', rec: false },
        { minH: 4320, label: '4320p 8K', rec: true }
    ];

    const uniqueResolutionsToFind = [];
    const seenMinH = new Set();
    for (const r of resolutionsToFind) {
        if (!seenMinH.has(r.minH)) {
            seenMinH.add(r.minH);
            uniqueResolutionsToFind.push(r);
        }
    }
    
    const dur = metadata.duration || 0;

    uniqueResolutionsToFind.forEach(({minH, label, rec}) => {
        let maxH = 99999;
        if (minH === 2160) maxH = 4319;
        if (minH === 1440) maxH = 2159;
        if (minH === 1080) maxH = 1439;
        if (minH === 720) maxH = 1079;
        if (minH === 480) maxH = 719;
        if (minH === 360) maxH = 479;
        
        const vids = allVids.filter(f => f.height >= minH && f.height <= maxH);
        if (vids.length === 0) return;
        
        vids.sort((a,b) => (b.fps||0) - (a.fps||0) || (b.tbr||0) - (a.tbr||0) || (b.filesize||0) - (a.filesize||0));
        const f = vids[0];
        
        let s = f.filesize || f.filesize_approx || 0;
        if (s > 0 && f.acodec === 'none') s += bestAudioSize;
        if (s === 0 && dur > 0) {
            let estMbps = minH >= 4320 ? 40 : minH >= 2160 ? 15 : minH >= 1440 ? 8 : minH >= 1080 ? 4 : minH >= 720 ? 1.5 : minH >= 480 ? 0.8 : 0.4;
            s = dur * (estMbps * 1024 * 1024 / 8);
        }
        
        videoFormats.push({
            id: f.format_id,
            quality: label,
            resolution: `${f.width || '?'}x${f.height || minH}`,
            fps: f.fps ? `${f.fps}fps` : '',
            codec: (f.vcodec || '').split('.')[0] || 'Unknown',
            sizeStr: s > 0 ? formatBytes(s) : 'Unknown',
            bytes: s,
            recommended: rec,
        });
    });

    videoFormats = videoFormats.filter((v,i,a)=>a.findIndex(t=>(t.quality===v.quality))===i);
    videoFormats.sort((a,b) => (parseInt(a.quality) || 0) - (parseInt(b.quality) || 0));

    console.log(JSON.stringify(videoFormats, null, 2));
}
