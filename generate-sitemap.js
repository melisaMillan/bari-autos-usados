const fs = require('fs');
const https = require('https');

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6o4nxhMt4EcGatRVtn0vXnX8Z68hCt5ttQm5vcQ3EHGYMoKFf9jMZA8-15YMimPOMDPs1UNmW8_6m/pub?gid=1637747501&single=true&output=csv';
const SITE_URL = 'https://bariusados.com.ar';

https.get(CSV_URL, (res) => {
    let data = '';
    res.on('data', chunk => {
        data += chunk;
    });

    res.on('end', () => {
        const lines = data.split('\n');
        if (lines.length === 0) return;

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const idxDominio = headers.findIndex(h => h.includes('dominio') || h.includes('patente'));
        const idxPublicar = headers.findIndex(h => h.includes('publicar'));

        if (idxDominio === -1) {
            console.error("Error: No se encontró la columna Dominio.");
            return;
        }

        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        sitemap += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        
        // Homepage
        sitemap += `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            let currentLine = lines[i];
            let cols = [];
            let inQuotes = false;
            let currentStr = '';
            for(let char of currentLine) {
                if(char === '"') inQuotes = !inQuotes;
                else if(char === ',' && !inQuotes) { cols.push(currentStr); currentStr = ''; }
                else currentStr += char;
            }
            cols.push(currentStr);

            const dominio = cols[idxDominio] ? cols[idxDominio].trim() : '';
            const publicar = idxPublicar !== -1 && cols[idxPublicar] ? cols[idxPublicar].trim().toUpperCase() : 'SI';

            if (dominio && publicar !== 'NO') {
                sitemap += `  <url>\n    <loc>${SITE_URL}/?v=${encodeURIComponent(dominio)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
            }
        }
        
        sitemap += `</urlset>`;
        fs.writeFileSync('sitemap.xml', sitemap);
        console.log("✅ sitemap.xml generado con éxito.");
    });
}).on('error', (err) => {
    console.error("Error: ", err.message);
});
