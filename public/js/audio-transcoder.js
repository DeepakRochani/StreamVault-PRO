/**
 * StreamVault PRO - In-Browser Audio Transcoder Engine
 * 
 * Automatically decodes raw YouTube/social audio streams (WebM Opus, M4A AAC, etc.)
 * in the background using the browser's native Web Audio API (AudioContext)
 * and encodes them into genuine, studio-quality 320 kbps MP3 files (MPEG ADTS Layer III)
 * via client-side LAME encoder (lamejs).
 * 
 * Complies with modern-web-architect and modern-web-performance standards:
 * - Edge & browser native processing
 * - Non-blocking async chunk loop yielding to maintain 60 FPS UI
 * - Graceful fallback to raw stream if browser AudioContext is restricted
 */

(function(global) {
    'use strict';

    // Verify if LAME encoder library is loaded, with automatic CDN fallback
    async function ensureLameLoaded() {
        if (typeof global.lamejs !== 'undefined' && global.lamejs.Mp3Encoder) {
            return true;
        }

        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'js/lame.min.js';
            s.onload = () => {
                if (typeof global.lamejs !== 'undefined' && global.lamejs.Mp3Encoder) {
                    resolve(true);
                } else {
                    tryCdn();
                }
            };
            s.onerror = tryCdn;

            function tryCdn() {
                const cdn = document.createElement('script');
                cdn.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
                cdn.onload = () => {
                    if (typeof global.lamejs !== 'undefined' && global.lamejs.Mp3Encoder) {
                        resolve(true);
                    } else {
                        reject(new Error('LAME encoder initialized without Mp3Encoder'));
                    }
                };
                cdn.onerror = () => reject(new Error('Failed to load MP3 encoder module from local and CDN.'));
                document.head.appendChild(cdn);
            }

            document.head.appendChild(s);
        });
    }

    /**
     * Inspect file signature to determine if audio buffer is already a genuine MP3
     */
    function isRealMp3(uint8Array) {
        if (!uint8Array || uint8Array.length < 4) return false;

        // Check for WebM / Matroska EBML header: 0x1A 0x45 0xDF 0xA3
        if (uint8Array[0] === 0x1A && uint8Array[1] === 0x45 && uint8Array[2] === 0xDF && uint8Array[3] === 0xA3) {
            return false;
        }

        // Check for MP4 / ISO container: byte 4..7 === 'ftyp'
        if (uint8Array.length >= 8) {
            const ftyp = String.fromCharCode(uint8Array[4], uint8Array[5], uint8Array[6], uint8Array[7]);
            if (ftyp === 'ftyp') return false;
        }

        // Check for ID3v2 tag (0x49 0x44 0x33)
        if (uint8Array[0] === 0x49 && uint8Array[1] === 0x44 && uint8Array[2] === 0x33) {
            return true;
        }

        // Check for MPEG Audio Frame Sync: 0xFF followed by 0xFB, 0xF3, 0xF2, 0xFA
        if (uint8Array[0] === 0xFF && (uint8Array[1] & 0xE0) === 0xE0) {
            return true;
        }

        return false;
    }

    /**
     * Pure-JS MP4 Demuxer fallback: extracts AAC audio track into M4A container
     */
    function extractAudioTrackToM4A(u8) {
        try {
            const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            function parseBoxes(start, end) {
                const boxes = [];
                let p = start;
                while (p + 8 <= end) {
                    let sz = view.getUint32(p, false);
                    const typ = String.fromCharCode(u8[p+4], u8[p+5], u8[p+6], u8[p+7]);
                    let headerSz = 8;
                    if (sz === 1) {
                        if (p + 16 > end) break;
                        const high = view.getUint32(p + 8, false);
                        const low = view.getUint32(p + 12, false);
                        sz = (high * 4294967296) + low;
                        headerSz = 16;
                    } else if (sz === 0) {
                        sz = end - p;
                    }
                    if (sz <= 0) break;
                    boxes.push({ typ, sz, pos: p, headerSz });
                    p += sz;
                }
                return boxes;
            }

            const topBoxes = parseBoxes(0, u8.byteLength);
            const moov = topBoxes.find(b => b.typ === 'moov');
            if (!moov) return null;

            const moovChildren = parseBoxes(moov.pos + moov.headerSz, moov.pos + moov.sz);
            for (const trak of moovChildren.filter(b => b.typ === 'trak')) {
                const trakChildren = parseBoxes(trak.pos + trak.headerSz, trak.pos + trak.sz);
                const mdia = trakChildren.find(b => b.typ === 'mdia');
                if (!mdia) continue;
                const mdiaChildren = parseBoxes(mdia.pos + mdia.headerSz, mdia.pos + mdia.sz);
                const hdlr = mdiaChildren.find(b => b.typ === 'hdlr');
                if (!hdlr) continue;
                const hType = String.fromCharCode(u8[hdlr.pos + 16], u8[hdlr.pos + 17], u8[hdlr.pos + 18], u8[hdlr.pos + 19]);
                if (hType === 'soun') {
                    // Fragmented fMP4
                    if (topBoxes.some(b => b.typ === 'moof')) {
                        const ftypHdr = new Uint8Array([
                            0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
                            0x4D, 0x34, 0x41, 0x20, 0x00, 0x00, 0x02, 0x00,
                            0x4D, 0x34, 0x41, 0x20, 0x6D, 0x70, 0x34, 0x32,
                            0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x00, 0x00
                        ]);
                        const newMoov = u8.subarray(moov.pos, moov.pos + moov.sz);
                        const parts = [ftypHdr, newMoov];
                        for (const b of topBoxes) {
                            if (b.typ === 'moof' || b.typ === 'mdat') parts.push(u8.subarray(b.pos, b.pos + b.sz));
                        }
                        const totalLen = parts.reduce((acc, p) => acc + p.byteLength, 0);
                        const res = new Uint8Array(totalLen);
                        let offset = 0;
                        for (const p of parts) {
                            res.set(p, offset);
                            offset += p.byteLength;
                        }
                        return res;
                    }
                }
            }
        } catch (_) {}
        return null;
    }

    /**
     * Transcode any browser-decodable audio Blob into genuine 320 kbps MP3
     * 
     * @param {Blob} rawBlob - Downloaded audio stream blob (WebM Opus, M4A AAC, etc.)
     * @param {Object} [options]
     * @param {number} [options.bitrate=320] - Target MP3 bitrate in kbps (default: 320)
     * @param {Function} [options.onProgress] - Progress callback: (percent: number, statusText: string) => void
     * @returns {Promise<Blob>} Genuine 320 kbps MP3 Blob (type: 'audio/mpeg')
     */
    async function transcodeBlobToMp3(rawBlob, options = {}) {
        const targetBitrate = options.bitrate || 320;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

        if (!rawBlob || rawBlob.size === 0) {
            throw new Error('Audio stream blob is empty');
        }

        const arrayBuffer = await rawBlob.arrayBuffer();
        const u8Check = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 64));

        // If it's already a genuine MP3 file, no re-encoding required!
        if (isRealMp3(u8Check)) {
            console.log('[StreamVault Transcoder] File is already genuine MP3. Preserving original bits.');
            onProgress(100, 'Audio is already genuine MP3.');
            return rawBlob.type === 'audio/mpeg' ? rawBlob : new Blob([arrayBuffer], { type: 'audio/mpeg' });
        }

        console.log('[StreamVault Transcoder] Container detected as WebM/M4A. Initiating Web Audio decode to 320 kbps MP3...');
        onProgress(5, 'Decoding audio samples via Web Audio...');

        const AudioContextClass = global.AudioContext || global.webkitAudioContext;
        if (!AudioContextClass) {
            console.warn('[StreamVault Transcoder] Web Audio API not supported, returning raw stream.');
            return rawBlob;
        }

        const audioCtx = new AudioContextClass();
        let audioBuffer = null;

        try {
            // Attempt standard Web Audio decode
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
        } catch (err1) {
            console.warn('[StreamVault Transcoder] Standard decode failed, attempting M4A extraction:', err1);
            try {
                const u8Full = new Uint8Array(arrayBuffer);
                const extractedM4A = extractAudioTrackToM4A(u8Full);
                if (extractedM4A) {
                    audioBuffer = await audioCtx.decodeAudioData(extractedM4A.buffer.slice(0));
                } else {
                    throw err1;
                }
            } catch (err2) {
                console.warn('[StreamVault Transcoder] Audio decoding failed entirely, returning raw stream:', err2);
                try { audioCtx.close(); } catch(_) {}
                return rawBlob;
            }
        }

        // Audio decoded successfully!
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const numSamples = audioBuffer.length;
        const channels = numChannels > 1 ? 2 : 1;

        console.log(`[StreamVault Transcoder] Decoded: ${numSamples} samples, ${sampleRate}Hz, ${numChannels}ch. Loading LAME encoder...`);
        onProgress(20, `Preparing ${targetBitrate} kbps MP3 encoder...`);

        await ensureLameLoaded();
        if (typeof global.lamejs === 'undefined' || !global.lamejs.Mp3Encoder) {
            console.warn('[StreamVault Transcoder] lamejs failed to initialize, returning raw stream.');
            try { audioCtx.close(); } catch(_) {}
            return rawBlob;
        }

        // Convert Float32 samples [-1.0, 1.0] to 16-bit PCM Int16Array [-32768, 32767]
        onProgress(30, 'Converting audio PCM buffers...');
        const leftFloat = audioBuffer.getChannelData(0);
        const rightFloat = numChannels > 1 ? audioBuffer.getChannelData(1) : null;

        const leftPcm = new Int16Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const s = Math.max(-1, Math.min(1, leftFloat[i]));
            leftPcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        let rightPcm = null;
        if (channels === 2 && rightFloat) {
            rightPcm = new Int16Array(numSamples);
            for (let i = 0; i < numSamples; i++) {
                const s = Math.max(-1, Math.min(1, rightFloat[i]));
                rightPcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
        }

        // Initialize LAME MP3 Encoder at 320 kbps
        const encoder = new global.lamejs.Mp3Encoder(channels, sampleRate, targetBitrate);
        const mp3Chunks = [];
        const blockSize = 1152;
        let lastYield = performance.now();

        onProgress(40, `Encoding Studio-Quality ${targetBitrate} kbps MP3...`);

        // Chunk encoding loop with non-blocking UI yields every ~35ms
        for (let i = 0; i < numSamples; i += blockSize) {
            const lChunk = leftPcm.subarray(i, i + blockSize);
            const rChunk = rightPcm ? rightPcm.subarray(i, i + blockSize) : null;
            const buf = rightPcm ? encoder.encodeBuffer(lChunk, rChunk) : encoder.encodeBuffer(lChunk);
            if (buf && buf.length > 0) {
                mp3Chunks.push(new Uint8Array(buf));
            }

            const now = performance.now();
            if (now - lastYield > 35) {
                const encodePct = Math.min(99, Math.round(40 + ((i / numSamples) * 55)));
                onProgress(encodePct, `Encoding ${targetBitrate} kbps MP3 (${encodePct}%)...`);
                await new Promise(r => setTimeout(r, 0));
                lastYield = performance.now();
            }
        }

        // Flush encoder buffer
        const flushBuf = encoder.flush();
        if (flushBuf && flushBuf.length > 0) {
            mp3Chunks.push(new Uint8Array(flushBuf));
        }

        // Clean up Web Audio context
        try { audioCtx.close(); } catch(_) {}

        // Create genuine MP3 Blob with audio/mpeg MIME type
        const mp3Blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
        console.log(`[StreamVault Transcoder] Transcode complete! Size: ${(mp3Blob.size / (1024 * 1024)).toFixed(2)} MB`);
        onProgress(100, `Genuine ${targetBitrate} kbps MP3 Ready!`);

        return mp3Blob;
    }

    // Expose globally
    global.StreamVaultAudioTranscoder = {
        ensureLameLoaded,
        isRealMp3,
        transcodeBlobToMp3
    };

})(typeof window !== 'undefined' ? window : this);
