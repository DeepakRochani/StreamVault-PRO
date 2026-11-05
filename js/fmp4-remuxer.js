/**
 * StreamVault Fast Pure-JS fMP4 Multiplexer
 * Merges high-res YouTube adaptive video (itag 137/1080p, etc.) and AAC audio (itag 140)
 * in pure JavaScript in <20ms without FFmpeg WASM, Web Workers, or external CDN dependencies.
 */
(function(global) {
    function parseBoxes(u8, start, end) {
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const boxes = [];
        let pos = start;
        while (pos < end) {
            if (pos + 8 > end) break;
            let size = view.getUint32(pos, false);
            let headerSize = 8;
            const type = String.fromCharCode(u8[pos+4], u8[pos+5], u8[pos+6], u8[pos+7]);
            if (size === 1) {
                if (pos + 16 > end) break;
                const high = view.getUint32(pos + 8, false);
                const low = view.getUint32(pos + 12, false);
                size = (high * 4294967296) + low;
                headerSize = 16;
            } else if (size === 0) {
                size = end - pos;
            }
            if (size <= 0) break;
            boxes.push({ type, pos, size, headerSize });
            pos += size;
        }
        return boxes;
    }

    function getTimescale(u8, trakBox) {
        const mdia = parseBoxes(u8, trakBox.pos + trakBox.headerSize, trakBox.pos + trakBox.size).find(b => b.type === 'mdia');
        if (!mdia) return 1000;
        const mdhd = parseBoxes(u8, mdia.pos + mdia.headerSize, mdia.pos + mdia.size).find(b => b.type === 'mdhd');
        if (!mdhd) return 1000;
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const version = u8[mdhd.pos + 8];
        return version === 1 ? view.getUint32(mdhd.pos + 28, false) : view.getUint32(mdhd.pos + 20, false);
    }

    function extractFragments(u8, timescale, targetTrackId) {
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const frags = [];
        let pos = 0;
        const len = u8.length;
        while (pos < len) {
            if (pos + 8 > len) break;
            let size = view.getUint32(pos, false);
            if (size <= 0 || pos + size > len) break;
            const type = String.fromCharCode(u8[pos+4], u8[pos+5], u8[pos+6], u8[pos+7]);
            if (type === 'moof') {
                const moofStart = pos;
                const moofSize = size;
                const mdatPos = pos + size;
                if (mdatPos + 8 > len) break;
                const mdatSize = view.getUint32(mdatPos, false);
                if (mdatSize <= 0 || mdatPos + mdatSize > len) break;

                const moofBoxes = parseBoxes(u8, moofStart + 8, moofStart + moofSize);
                const traf = moofBoxes.find(b => b.type === 'traf');
                let timeSec = 0;
                if (traf) {
                    const trafBoxes = parseBoxes(u8, traf.pos + traf.headerSize, traf.pos + traf.size);
                    const tfdt = trafBoxes.find(b => b.type === 'tfdt');
                    if (tfdt) {
                        const version = u8[tfdt.pos + 8];
                        if (version === 1) {
                            const high = view.getUint32(tfdt.pos + 12, false);
                            const low = view.getUint32(tfdt.pos + 16, false);
                            timeSec = ((high * 4294967296) + low) / timescale;
                        } else {
                            timeSec = view.getUint32(tfdt.pos + 12, false) / timescale;
                        }
                    }
                }

                let moofData;
                if (targetTrackId !== 1) {
                    moofData = new Uint8Array(u8.subarray(moofStart, moofStart + moofSize));
                    const moofView = new DataView(moofData.buffer, moofData.byteOffset, moofData.byteLength);
                    const cMoofBoxes = parseBoxes(moofData, 8, moofSize);
                    const cTraf = cMoofBoxes.find(b => b.type === 'traf');
                    if (cTraf) {
                        const cTrafBoxes = parseBoxes(moofData, cTraf.pos + cTraf.headerSize, cTraf.pos + cTraf.size);
                        const cTfhd = cTrafBoxes.find(b => b.type === 'tfhd');
                        if (cTfhd) {
                            moofView.setUint32(cTfhd.pos + 12, targetTrackId, false);
                        }
                    }
                } else {
                    moofData = u8.subarray(moofStart, moofStart + moofSize);
                }

                const mdatData = u8.subarray(mdatPos, mdatPos + mdatSize);
                frags.push({ timeSec, moofData, mdatData });
                pos = mdatPos + mdatSize;
            } else {
                pos += size;
            }
        }
        return frags;
    }

    function remux(videoU8, audioU8) {
        const vMoov = parseBoxes(videoU8, 0, 4000).find(b => b.type === 'moov');
        const aMoov = parseBoxes(audioU8, 0, 4000).find(b => b.type === 'moov');
        if (!vMoov || !aMoov) {
            throw new Error('Missing fMP4 moov header in input streams');
        }

        const vTrak = parseBoxes(videoU8, vMoov.pos + vMoov.headerSize, vMoov.pos + vMoov.size).find(b => b.type === 'trak');
        const aTrak = parseBoxes(audioU8, aMoov.pos + aMoov.headerSize, aMoov.pos + aMoov.size).find(b => b.type === 'trak');
        if (!vTrak || !aTrak) {
            throw new Error('Missing video or audio trak box');
        }

        const vTimescale = getTimescale(videoU8, vTrak);
        const aTimescale = getTimescale(audioU8, aTrak);

        const vFrags = extractFragments(videoU8, vTimescale, 1);
        const aFrags = extractFragments(audioU8, aTimescale, 2);

        if (vFrags.length === 0 || aFrags.length === 0) {
            throw new Error('No fMP4 media fragments found to remux');
        }

        // 1. Audio trak copy with track_ID = 2
        const aTrakData = new Uint8Array(audioU8.subarray(aTrak.pos, aTrak.pos + aTrak.size));
        const aTrakView = new DataView(aTrakData.buffer, aTrakData.byteOffset, aTrakData.byteLength);
        const aTrakBoxes = parseBoxes(aTrakData, 8, aTrakData.length);
        const aTkhd = aTrakBoxes.find(b => b.type === 'tkhd');
        if (aTkhd) {
            const aTkhdVer = aTrakData[aTkhd.pos + 8];
            const trackIdOffset = aTkhdVer === 1 ? aTkhd.pos + 28 : aTkhd.pos + 20;
            aTrakView.setUint32(trackIdOffset, 2, false);
        }

        // 2. Audio trex copy with track_ID = 2
        const aMvex = parseBoxes(audioU8, aMoov.pos + aMoov.headerSize, aMoov.pos + aMoov.size).find(b => b.type === 'mvex');
        let aTrexData = null;
        if (aMvex) {
            const aTrex = parseBoxes(audioU8, aMvex.pos + aMvex.headerSize, aMvex.pos + aMvex.size).find(b => b.type === 'trex');
            if (aTrex) {
                aTrexData = new Uint8Array(audioU8.subarray(aTrex.pos, aTrex.pos + aTrex.size));
                const aTrexView = new DataView(aTrexData.buffer, aTrexData.byteOffset, aTrexData.byteLength);
                aTrexView.setUint32(12, 2, false);
            }
        }

        // 3. Video mvhd, mvex, trak
        const vMvhd = parseBoxes(videoU8, vMoov.pos + vMoov.headerSize, vMoov.pos + vMoov.size).find(b => b.type === 'mvhd');
        const vMvhdData = videoU8.subarray(vMvhd.pos, vMvhd.pos + vMvhd.size);

        const vMvex = parseBoxes(videoU8, vMoov.pos + vMoov.headerSize, vMoov.pos + vMoov.size).find(b => b.type === 'mvex');
        let vTrexData = null;
        if (vMvex) {
            const vTrex = parseBoxes(videoU8, vMvex.pos + vMvex.headerSize, vMvex.pos + vMvex.size).find(b => b.type === 'trex');
            if (vTrex) {
                vTrexData = videoU8.subarray(vTrex.pos, vTrex.pos + vTrex.size);
            }
        }

        const vTrakData = videoU8.subarray(vTrak.pos, vTrak.pos + vTrak.size);

        // Assemble new mvex box
        const mvexParts = [];
        if (vTrexData) mvexParts.push(vTrexData);
        if (aTrexData) mvexParts.push(aTrexData);

        let mvexPayloadLen = 0;
        for (const p of mvexParts) mvexPayloadLen += p.length;
        const newMvexHeader = new Uint8Array(8);
        const mvexHeaderView = new DataView(newMvexHeader.buffer);
        mvexHeaderView.setUint32(0, mvexPayloadLen + 8, false);
        newMvexHeader[4] = 109; newMvexHeader[5] = 118; newMvexHeader[6] = 101; newMvexHeader[7] = 120; // 'mvex'

        // Assemble new moov box
        const moovParts = [vMvhdData, newMvexHeader, ...mvexParts, vTrakData, aTrakData];
        let moovPayloadLen = 0;
        for (const p of moovParts) moovPayloadLen += p.length;
        const newMoovHeader = new Uint8Array(8);
        const moovHeaderView = new DataView(newMoovHeader.buffer);
        moovHeaderView.setUint32(0, moovPayloadLen + 8, false);
        newMoovHeader[4] = 109; newMoovHeader[5] = 111; newMoovHeader[6] = 111; newMoovHeader[7] = 118; // 'moov'

        // Video ftyp
        const vFtyp = parseBoxes(videoU8, 0, 500).find(b => b.type === 'ftyp');
        const ftypData = vFtyp ? videoU8.subarray(vFtyp.pos, vFtyp.pos + vFtyp.size) : new Uint8Array(0);

        // Interleave fragments chronologically
        const allFrags = [...vFrags.map(f => ({ ...f, type: 'v' })), ...aFrags.map(f => ({ ...f, type: 'a' }))];
        allFrags.sort((a, b) => a.timeSec - b.timeSec);

        const outParts = [ftypData, newMoovHeader, ...moovParts];
        for (const f of allFrags) {
            outParts.push(f.moofData);
            outParts.push(f.mdatData);
        }

        return new Blob(outParts, { type: 'video/mp4' });
    }

    global.StreamVaultRemuxer = {
        isLoaded: true,
        async init() {
            return true;
        },
        async mergeVideoAndAudio(videoBlob, audioBlob) {
            if (!videoBlob || !audioBlob) return videoBlob;
            const startTime = performance.now();
            try {
                const [vBuf, aBuf] = await Promise.all([
                    videoBlob.arrayBuffer(),
                    audioBlob.arrayBuffer()
                ]);
                const vU8 = new Uint8Array(vBuf);
                const aU8 = new Uint8Array(aBuf);

                const mergedBlob = remux(vU8, aU8);
                const elapsed = Math.round(performance.now() - startTime);
                console.log(`[StreamVault Remuxer] Fast remux succeeded in ${elapsed}ms! Output size: ${mergedBlob.size} bytes`);
                return mergedBlob;
            } catch (err) {
                console.warn('[StreamVault Remuxer Error]:', err?.message || err);
                return videoBlob;
            }
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
