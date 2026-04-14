// DOM Elements
const uploadInput = document.getElementById('image-upload');
const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('placeholder');
const sliceBtn = document.getElementById('slice-btn');

// Controls
const sliceModeSelect = document.getElementById('slice-mode');
const gridWInput = document.getElementById('grid-w');
const gridHInput = document.getElementById('grid-h');
const gridOffXInput = document.getElementById('grid-off-x');
const gridOffYInput = document.getElementById('grid-off-y');
const gridGapXInput = document.getElementById('grid-gap-x');
const gridGapYInput = document.getElementById('grid-gap-y');
const scaleInput = document.getElementById('image-scale');
const outSizeSelect = document.getElementById('output-size');
const paddingInfo = document.getElementById('padding-info');
const prefixInput = document.getElementById('file-prefix');
const statsDisplay = document.getElementById('image-stats');

// Mode Controls
const manualControls = document.getElementById('manual-grid-controls');
const autoDetectControls = document.getElementById('auto-detect-controls');
const autoIslandControls = document.getElementById('auto-island-controls');

// Auto-Detect Box Config
const boxColorInput = document.getElementById('box-color');
const boxToleranceInput = document.getElementById('box-tolerance');
const excludeBorderInput = document.getElementById('exclude-border');

// Background Removal Controls
const removeBgInput = document.getElementById('remove-bg');
const bgControls = document.getElementById('bg-controls');
const bgColorInput = document.getElementById('bg-color');
const bgToleranceInput = document.getElementById('bg-tolerance');

// View Controls
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelText = document.getElementById('zoom-level');

// State
let loadedImage = null;
let currentZoom = 1;
let detectedBoxes = [];

// --- Initialization ---

// Event Listeners
uploadInput.addEventListener('change', handleImageUpload);

[gridWInput, gridHInput, gridOffXInput, gridOffYInput, gridGapXInput, gridGapYInput, scaleInput, outSizeSelect].forEach(el => el.addEventListener('input', updateView));

sliceModeSelect.addEventListener('change', () => {
    manualControls.style.display = sliceModeSelect.value === 'grid' ? 'flex' : 'none';
    autoDetectControls.style.display = sliceModeSelect.value === 'auto-box' ? 'flex' : 'none';
    autoIslandControls.style.display = sliceModeSelect.value === 'auto-island' ? 'flex' : 'none';
    updateView();
});

boxColorInput.addEventListener('input', updateView);
boxToleranceInput.addEventListener('input', updateView);
excludeBorderInput.addEventListener('change', updateView);

removeBgInput.addEventListener('change', () => {
    bgControls.style.display = removeBgInput.checked ? 'flex' : 'none';
    updateView();
});
bgColorInput.addEventListener('input', updateView);
bgToleranceInput.addEventListener('input', updateView);

zoomInBtn.addEventListener('click', () => setZoom(currentZoom + 0.25));
zoomOutBtn.addEventListener('click', () => setZoom(currentZoom - 0.25));

sliceBtn.addEventListener('click', generateSprites);

// --- Functions ---

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImage = img;
            placeholder.style.display = 'none';
            canvas.style.display = 'block';
            sliceBtn.disabled = false;
            statsDisplay.textContent = `Original: ${img.width}x${img.height}px`;
            
            // Auto guess grid size based on common heights if not set
            if (gridWInput.value === "64" && gridHInput.value === "64") {
               setZoom(1);
            }
            
            updateView();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function updateView() {
    if (!loadedImage) return;

    const gridW = parseInt(gridWInput.value) || 1;
    const gridH = parseInt(gridHInput.value) || 1;
    const gridOffX = parseInt(gridOffXInput.value) || 0;
    const gridOffY = parseInt(gridOffYInput.value) || 0;
    const gridGapX = parseInt(gridGapXInput.value) || 0;
    const gridGapY = parseInt(gridGapYInput.value) || 0;

    const outSize = parseInt(outSizeSelect.value);
    const sliceMode = sliceModeSelect.value;
    const scale = parseFloat(scaleInput.value) / 100 || 1;

    // Output dimension checks for Padding logic
    if (sliceMode === 'grid') {
        const padX = outSize - gridW;
        const padY = outSize - gridH;

        if (padX < 0 || padY < 0) {
            paddingInfo.innerHTML = '⚠️ Grid is larger than Power of 2 Size!';
            paddingInfo.classList.add('warning');
            sliceBtn.disabled = true;
        } else {
            paddingInfo.innerHTML = `Padding: ${padX/2}px ↔, ${padY/2}px ↕`;
            paddingInfo.classList.remove('warning');
            sliceBtn.disabled = false;
        }
        paddingInfo.style.display = 'flex';
    } else {
        paddingInfo.style.display = 'none';
    }

    // Prepare native resolution image data
    const nativeW = loadedImage.width;
    const nativeH = loadedImage.height;
    
    const offCanvas = document.createElement('canvas');
    offCanvas.width = nativeW;
    offCanvas.height = nativeH;
    const offCtx = offCanvas.getContext('2d', {willReadFrequently: true});
    offCtx.drawImage(loadedImage, 0, 0);
    
    let imgData = offCtx.getImageData(0, 0, nativeW, nativeH);
    
    // Apply Background Removal
    if (removeBgInput.checked) {
        const targetColor = hexToRgba(bgColorInput.value);
        const tolPercent = (parseInt(bgToleranceInput.value) || 0) / 100;
        const tolVal = tolPercent * 255;
        const maxDist = 441.67;
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] === 0) continue;
            const r = data[i], g = data[i+1], b = data[i+2];
            const dist = Math.sqrt(Math.pow(r - targetColor.r, 2) + Math.pow(g - targetColor.g, 2) + Math.pow(b - targetColor.b, 2));
            if ((dist / maxDist) * 255 <= tolVal) { 
                data[i+3] = 0; // Make transparent
            }
        }
        offCtx.putImageData(imgData, 0, 0);
    }
    
    // Setup Main Canvas
    canvas.width = nativeW * scale;
    canvas.height = nativeH * scale;
    ctx.imageSmoothingEnabled = false; // Crisp pixels
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);

    detectedBoxes = [];
    
    // Mode-specific Logic
    if (sliceMode === 'auto-island') {
        detectedBoxes = findSpriteIslands(imgData);
        drawBoxes(detectedBoxes, scale, '#22c55e', true);
        
        sliceBtn.disabled = detectedBoxes.length === 0;
        if (detectedBoxes.length === 0) {
            paddingInfo.style.display = 'block';
            paddingInfo.innerHTML = '⚠️ No sprites found!';
            paddingInfo.classList.add('warning');
        }
    } else if (sliceMode === 'auto-box') {
        const tol = (parseInt(boxToleranceInput.value) || 0) / 100;
        detectedBoxes = findBoundingBoxes(imgData, boxColorInput.value, tol);
        drawBoxes(detectedBoxes, scale, '#ef4444', true);
        
        sliceBtn.disabled = detectedBoxes.length === 0;
        if (detectedBoxes.length === 0) {
            paddingInfo.style.display = 'block';
            paddingInfo.innerHTML = '⚠️ No boxes found!';
            paddingInfo.classList.add('warning');
        }
    } else {
        detectedBoxes = generateGridBoxes(nativeW, nativeH, gridW, gridH, gridOffX, gridOffY, gridGapX, gridGapY);
        drawBoxes(detectedBoxes, scale, 'rgba(6, 182, 212, 0.8)', false);
    }
}

function generateGridBoxes(w, h, cellW, cellH, offX, offY, gapX, gapY) {
    const boxes = [];
    if (cellW <= 0 || cellH <= 0) return boxes;
    for (let y = offY; y + cellH <= h; y += cellH + gapY) {
        for (let x = offX; x + cellW <= w; x += cellW + gapX) {
            boxes.push({x: x, y: y, w: cellW, h: cellH});
        }
    }
    return boxes;
}

function findSpriteIslands(imgData) {
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;
    
    const visited = new Uint8Array(width * height);
    const boxes = [];
    
    // BFS queue arrays
    const qX = new Uint16Array(width * height);
    const qY = new Uint16Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (visited[idx]) continue;
            
            const px = idx * 4;
            // Ignore transparent pixels immediately
            if (data[px+3] === 0) {
                visited[idx] = 1;
                continue;
            }
            
            // Found a pixel, BFS to find whole connected island
            let minX = x, maxX = x, minY = y, maxY = y;
            let qHead = 0, qTail = 0;
            
            qX[qTail] = x;
            qY[qTail] = y;
            qTail++;
            visited[idx] = 1;
            
            while(qHead < qTail) {
                const cx = qX[qHead];
                const cy = qY[qHead];
                qHead++;
                
                if (cx < minX) minX = cx;
                if (cx > maxX) maxX = cx;
                if (cy < minY) minY = cy;
                if (cy > maxY) maxY = cy;
                
                // 8-connected Neighbors
                const neighbors = [
                    {nx: cx-1, ny: cy}, {nx: cx+1, ny: cy},
                    {nx: cx, ny: cy-1}, {nx: cx, ny: cy+1},
                    {nx: cx-1, ny: cy-1}, {nx: cx+1, ny: cy-1},
                    {nx: cx-1, ny: cy+1}, {nx: cx+1, ny: cy+1} 
                ];
                
                for (let n of neighbors) {
                    const nx = n.nx, ny = n.ny;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        if (!visited[nIdx]) {
                            const nPx = nIdx * 4;
                            if (data[nPx+3] !== 0) {
                                visited[nIdx] = 1;
                                qX[qTail] = nx;
                                qY[qTail] = ny;
                                qTail++;
                            } else {
                                visited[nIdx] = 1; // Mark transparent as visited so we don't check
                            }
                        }
                    }
                }
            }
            
            // Keep legitimate boxes (ignore tiny noise like 1x1 pixels)
            const w = maxX - minX + 1;
            const h = maxY - minY + 1;
            if (w >= 2 && h >= 2) {
                boxes.push({x: minX, y: minY, w: w, h: h});
            }
        }
    }
    return boxes;
}

function findBoundingBoxes(imgData, hexCode, tolPercent) {
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;
    const target = hexToRgba(hexCode);
    const tolVal = tolPercent * 255;
    const maxDist = 441.67;

    const visited = new Uint8Array(width * height);
    const boxes = [];
    
    // BFS queue arrays
    const qX = new Uint16Array(width * height);
    const qY = new Uint16Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (visited[idx]) continue;
            
            const px = idx * 4;
            // Ignore fully transparent pixels immediately
            if (data[px+3] === 0) {
                visited[idx] = 1;
                continue;
            }
            
            const r = data[px], g = data[px+1], b = data[px+2];
            const dist = Math.sqrt(Math.pow(r - target.r, 2) + Math.pow(g - target.g, 2) + Math.pow(b - target.b, 2));
            const normalizedDist = (dist / maxDist) * 255;
            
            if (normalizedDist <= tolVal) {
                // Found a boundary pixel, BFS to find whole connected rectangle border
                let minX = x, maxX = x, minY = y, maxY = y;
                let qHead = 0, qTail = 0;
                
                qX[qTail] = x;
                qY[qTail] = y;
                qTail++;
                visited[idx] = 1;
                
                while(qHead < qTail) {
                    const cx = qX[qHead];
                    const cy = qY[qHead];
                    qHead++;
                    
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;
                    
                    // 8-connected Neighbors
                    const neighbors = [
                        {nx: cx-1, ny: cy}, {nx: cx+1, ny: cy},
                        {nx: cx, ny: cy-1}, {nx: cx, ny: cy+1},
                        {nx: cx-1, ny: cy-1}, {nx: cx+1, ny: cy-1},
                        {nx: cx-1, ny: cy+1}, {nx: cx+1, ny: cy+1} 
                    ];
                    
                    for (let n of neighbors) {
                        const nx = n.nx, ny = n.ny;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (!visited[nIdx]) {
                                const nPx = nIdx * 4;
                                if (data[nPx+3] !== 0) {
                                    const dr = data[nPx] - target.r;
                                    const dg = data[nPx+1] - target.g;
                                    const db = data[nPx+2] - target.b;
                                    const ndist = Math.sqrt(dr*dr + dg*dg + db*db);
                                    if ((ndist / maxDist) * 255 <= tolVal) {
                                        visited[nIdx] = 1;
                                        qX[qTail] = nx;
                                        qY[qTail] = ny;
                                        qTail++;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Keep legitimate boxes
                const w = maxX - minX + 1;
                const h = maxY - minY + 1;
                if (w >= 4 && h >= 4) {
                    boxes.push({x: minX, y: minY, w: w, h: h});
                }
            } else {
                visited[idx] = 1;
            }
        }
    }
    return boxes;
}

function drawBoxes(boxes, scale, color, dash) {
    if (boxes.length === 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (dash) {
        ctx.setLineDash([4, 2]); // Dashing
    }
    
    for (let b of boxes) {
        ctx.strokeRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    }
    ctx.restore();
}

function setZoom(newZoom) {
    currentZoom = Math.max(0.25, Math.min(newZoom, 4));
    zoomLevelText.textContent = `${Math.round(currentZoom * 100)}%`;
    canvas.style.transform = `scale(${currentZoom})`;
}

function hexToRgba(hex) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

async function generateSprites() {
    if (!loadedImage) return;
    
    // UI Feedback
    const origBtnText = sliceBtn.innerHTML;
    sliceBtn.innerHTML = '<svg class="spinner" viewBox="0 0 50 50" style="animation: spin 1s linear infinite; width: 20px; height: 20px;"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle></svg> Processing...';
    sliceBtn.disabled = true;

    try {
        const outSize = parseInt(outSizeSelect.value);
        let prefix = prefixInput.value.trim();
        
        // Native resolution clean image without grid marks drawn on it
        const offCanvas = document.createElement('canvas');
        offCanvas.width = loadedImage.width;
        offCanvas.height = loadedImage.height;
        const oCtx = offCanvas.getContext('2d', {willReadFrequently: true});
        oCtx.drawImage(loadedImage, 0, 0);

        if (removeBgInput.checked) {
            let imgData = oCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
            const targetColor = hexToRgba(bgColorInput.value);
            const tolPercent = (parseInt(bgToleranceInput.value) || 0) / 100;
            const tolVal = tolPercent * 255;
            const maxDist = 441.67;
            const data = imgData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                if (data[i+3] === 0) continue;
                const r = data[i], g = data[i+1], b = data[i+2];
                const dist = Math.sqrt(Math.pow(r - targetColor.r, 2) + Math.pow(g - targetColor.g, 2) + Math.pow(b - targetColor.b, 2));
                if ((dist / maxDist) * 255 <= tolVal) { data[i+3] = 0; }
            }
            oCtx.putImageData(imgData, 0, 0);
        }

        // Output single-sprite canvas
        const outCanvas = document.createElement('canvas');
        outCanvas.width = outSize;
        outCanvas.height = outSize;
        const outCtx = outCanvas.getContext('2d');

        const zip = new JSZip();
        let counter = 0;
        const sliceMode = document.getElementById('slice-mode').value;

        for (let b of detectedBoxes) {
            let extractX = b.x;
            let extractY = b.y;
            let extractW = b.w;
            let extractH = b.h;

            if (sliceMode === 'auto-box' && excludeBorderInput.checked) {
                extractX += 1;
                extractY += 1;
                extractW -= 2;
                extractH -= 2;
            }

            if (extractW > outSize) extractW = outSize;
            if (extractH > outSize) extractH = outSize;
            if (extractW <= 0 || extractH <= 0) continue;

            const offsetX = Math.floor((outSize - extractW) / 2);
            const offsetY = Math.floor((outSize - extractH) / 2);

            outCtx.clearRect(0, 0, outSize, outSize);
            outCtx.drawImage(
                offCanvas,
                extractX, extractY, extractW, extractH,
                offsetX, offsetY, extractW, extractH
            );

            const blob = await new Promise(resolve => outCanvas.toBlob(resolve, 'image/png'));
            const fileName = `${prefix}${counter}.png`;
            zip.file(fileName, blob);
            counter++;
        }

        // Generate Zip File
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, 'sprites.zip');
        
        showToast(`Successfully packaged ${counter} sprites!`);

    } catch (err) {
        console.error(err);
        showToast('Error generating sprites.', true);
    } finally {
        sliceBtn.innerHTML = origBtnText;
        sliceBtn.disabled = detectedBoxes.length === 0;
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? '#ef4444' : '#10b981';
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        100% { transform: rotate(360deg); }
    }
    .spinner {
        display: inline-block;
    }
`;
document.head.appendChild(style);
