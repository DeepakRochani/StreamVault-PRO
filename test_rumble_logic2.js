const metadata = {
    id: "v1b47be",
    title: "Test Video",
    url: "http://test",
    vcodec: "h264",
    acodec: "aac"
};

let videoFormats = [];
const allVids = (metadata.formats || []).filter(f => {
    if (f.vcodec === 'none' || f.vcodec === 'mhtml' || f.vcodec === 'images' || (f.format_id && String(f.format_id).startsWith('sb'))) {
        return false;
    }
    return true;
});

const resolutionsToFind = [
    { minH: 360, label: '360p', rec: false }
];

resolutionsToFind.forEach(({minH, label, rec}) => {
    let maxH = 9999;
    if (minH === 360) maxH = 479;
    
    const vids = allVids.filter(f => f.height >= minH && f.height <= maxH);
    if (vids.length === 0) return;
    
    const f = vids[0];
    videoFormats.push({
        id: f.format_id,
        quality: label,
        resolution: `${f.width || '?'}x${f.height || minH}`,
    });
});

if (videoFormats.length === 0 && allVids.length > 0) {
    const bestVid = allVids[allVids.length - 1];
    videoFormats.push({
        id: bestVid.format_id || 'bestvideo',
        quality: 'Original Quality',
        resolution: bestVid.resolution || 'Unknown',
    });
}
console.log("videoFormats:", videoFormats);
console.log("allVids.length:", allVids.length);
