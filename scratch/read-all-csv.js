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

function parseCSV(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        // Simple comma split (caution: handles fields without commas only, but good enough for this debug)
        const rowValues = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
            row[header] = rowValues[index] || '';
        });
        data.push(row);
    }
    return data;
}

async function run() {
    try {
        const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNeU-0-iHoNdVLACtHnPEpWI_ImAiymdaV0BH_IU53w_7YsG51T5HiKU5t8pGpx8JiRQf3t7anzy0t/pub?output=csv';
        const csvText = await getCsv(url);
        const rows = parseCSV(csvText);
        
        console.log("Inventario Completo en Google Sheets:");
        rows.forEach((row, i) => {
            console.log(`\nFila ${i + 2}: ${row.marca || 'N/A'} ${row.modelo || 'N/A'}`);
            console.log(`- Imagenes: "${row.imagenes}"`);
            console.log(`- Estado: "${row.estado}"`);
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
