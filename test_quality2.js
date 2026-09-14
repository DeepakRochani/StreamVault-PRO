const allVids = [{ height: "720" }];
const vids = allVids.filter(f => f.height >= 720 && f.height <= 1079);
console.log(vids);
