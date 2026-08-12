const fs = require('fs');

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsjdvcV1oZXIKTXmK2GAQgKlqceFDYtfHK55lVl8dn9CqQg7Qlh5tlEeLaAeptH_pJvYLKCb3zQQ1v/pub?gid=929531639&single=true&output=csv';
const SITE_URL = 'https://bariusados.com.ar';

async function generateSitemap() {
    try {
        console.log("Descargando datos desde Google Sheets...");
        const response = await fetch(CSV_URL);
        
        if (!response.ok) {
            throw new Error(`Error en la descarga: ${response.statusText}`);
        }

        const data = await response.text();
        const lines = data.split('\n');
        if (lines.length === 0) {
            console.error("Error: El archivo descargado está vacío.");
            return;
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_'));
        const idxPublicar = headers.findIndex(h => h === 'publicar');
        const idxMarca = headers.findIndex(h => h === 'marca');
        const idxModelo = headers.findIndex(h => h === 'modelo' || h === 'descripcion_de_modelo');
        const idxVersion = headers.findIndex(h => h === 'version');
        const idxAnio = headers.findIndex(h => h === 'ano' || h === 'anio');
        const idxCiudad = headers.findIndex(h => h === 'sucursal' || h === 'ciudad');

        if (idxMarca === -1 || idxModelo === -1) {
            console.error("Error: Faltan columnas clave (Marca, Modelo). Verificá que la planilla CSV sea correcta.");
            console.error("Encabezados encontrados:", headers);
            return;
        }

        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        sitemap += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        
        // Homepage
        sitemap += `  <url>\n    <loc>${SITE_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

        const slugCounts = {};
        let countAutos = 0;

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            // Simple CSV split handling quotes
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

            const publicar = idxPublicar !== -1 && cols[idxPublicar] ? cols[idxPublicar].trim().toUpperCase() : 'SI';
            const marca = cols[idxMarca] ? cols[idxMarca].trim() : '';
            const modelo = cols[idxModelo] ? cols[idxModelo].trim() : '';
            const version = idxVersion !== -1 && cols[idxVersion] ? cols[idxVersion].trim() : '';
            const anio = idxAnio !== -1 && cols[idxAnio] ? cols[idxAnio].trim() : '';
            const ciudad = idxCiudad !== -1 && cols[idxCiudad] ? cols[idxCiudad].trim() : '';

            if (marca && modelo && publicar !== 'NO') {
                const rawSlug = `${marca} ${modelo} ${version} ${anio} ${ciudad}`
                    .toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)+/g, '');
                
                let finalSlug = rawSlug;
                if (slugCounts[rawSlug]) {
                    slugCounts[rawSlug]++;
                    finalSlug = `${rawSlug}-${slugCounts[rawSlug]}`;
                } else {
                    slugCounts[rawSlug] = 1;
                }

                sitemap += `  <url>\n    <loc>${SITE_URL}/?auto=${encodeURIComponent(finalSlug)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
                countAutos++;
            }
        }
        
        sitemap += `</urlset>`;
        fs.writeFileSync('sitemap.xml', sitemap);
        console.log(`✅ sitemap.xml generado con éxito. Se incluyeron ${countAutos} vehículos.`);

    } catch (err) {
        console.error("Error general: ", err.message);
    }
}

generateSitemap();
