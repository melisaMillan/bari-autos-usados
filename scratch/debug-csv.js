const https = require('https');

function getCsv(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                resolve(getCsv(res.headers.location));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Very basic CSV parser to emulate PapaParse output
function parseCSV(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return [];
    
    // Parse headers
    const headers = lines[0].split(',');
    
    // Parse rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const rowValues = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
            row[header] = rowValues[index] || '';
        });
        data.push(row);
    }
    return data;
}

// Transform Google Drive URL to a direct image link
function transformDriveUrl(url) {
    if (!url) return '';
    url = url.trim();
    const regExp = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = url.match(regExp);
    if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    const queryRegExp = /[?&]id=([a-zA-Z0-9_-]+)/;
    const queryMatch = url.match(queryRegExp);
    if (queryMatch && queryMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${queryMatch[1]}`;
    }
    return url;
}

function parseImagesField(imageField) {
    if (!imageField) return [];
    return imageField
        .split(';')
        .map(url => url.trim())
        .filter(url => url.length > 0)
        .map(url => transformDriveUrl(url));
}

async function run() {
    try {
        const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNeU-0-iHoNdVLACtHnPEpWI_ImAiymdaV0BH_IU53w_7YsG51T5HiKU5t8pGpx8JiRQf3t7anzy0t/pub?output=csv';
        const csvText = await getCsv(url);
        
        console.log("CSV TEXT ACQUIRED. Length:", csvText.length);
        const rows = parseCSV(csvText);
        console.log("PARSED ROWS COUNT:", rows.length);
        
        // Execute the exact mapping logic in app.js
        console.log("RUNNING MAPPING LOGIC...");
        const vehicles = rows.map((row, index) => {
            try {
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim().toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .replace(/\s+/g, '_');
                    cleanRow[cleanKey] = row[key];
                });
                
                const mapped = {
                    id: cleanRow.id || Math.random().toString(36).substring(2, 9),
                    marca: (cleanRow.marca || '').trim(),
                    modelo: (cleanRow.modelo || '').trim(),
                    version: (cleanRow.version || '').trim(),
                    anio: parseInt(cleanRow.anio) || new Date().getFullYear(),
                    precio: parseFloat(cleanRow.precio) || 0,
                    kilometros: parseInt(cleanRow.kilometros) || 0,
                    transmision: (cleanRow.transmision || 'Manual').trim(),
                    combustible: (cleanRow.combustible || 'Nafta').trim(),
                    color: (cleanRow.color || 'Gris').trim(),
                    imagenes: parseImagesField(cleanRow.imagenes),
                    descripcion: (cleanRow.descripcion || '').trim(),
                    estado: (cleanRow.estado || 'Disponible').trim()
                };
                
                console.log(`Row ${index + 1} mapped successfully:`, mapped.marca, mapped.modelo);
                return mapped;
            } catch (err) {
                console.error(`ERROR MAPPING ROW ${index + 1}:`, err.message);
                throw err;
            }
        });
        
        console.log("All rows mapped successfully! Total vehicles:", vehicles.length);
    } catch (e) {
        console.error("CRITICAL EXCEPTION IN SIMULATION:", e);
    }
}

run();
