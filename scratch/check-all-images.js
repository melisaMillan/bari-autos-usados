const https = require('https');

const images = [
  { name: "Fila 2 (Clase C 250)", id: "1a6pZhQKerDfqVHErhr2R8XR9qxN4foui" },
  { name: "Fila 3 (GLA 250)", id: "1rNRFQtv7V1mPYki7m53hMRO6ly648qsj" },
  { name: "Fila 4 (Clase A 200)", id: "1ZzlRMIcDuAXmW4UxvlpHNrHvolVUQbYf" },
  { name: "Fila 5 (Audi A4)", id: "1yIenV6DoQQ-IHu5frmb64Pc23y6dJaTY" },
  { name: "Fila 6 (BMW 320i)", id: "1FNULtiX5Re9szSE64u5gTOL99hiydXxc" },
  { name: "Fila 7 (Clase E 300)", id: "1YI9WB5-dIXyBqFdZbVidGvCVqIq7aPW8" }
];

function checkImage(img) {
  const url = `https://lh3.googleusercontent.com/d/${img.id}`;
  https.get(url, (res) => {
    console.log(`${img.name} -> STATUS: ${res.statusCode} | Content-Type: ${res.headers["content-type"]} | Size: ${res.headers["content-length"]} bytes`);
    
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`   [REDIRECT]: ${res.headers.location}`);
    }
  }).on('error', (err) => {
    console.error(`ERROR [${img.name}]:`, err.message);
  });
}

images.forEach(checkImage);
