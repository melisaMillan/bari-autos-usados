const https = require('https');

const images = [
  { name: "Clase C 250", url: "https://lh3.googleusercontent.com/d/1a6pZhQKerDfqVHErhr2R8XR9qxN4foui" },
  { name: "GLA 250", url: "https://lh3.googleusercontent.com/d/1rNRFQtv7V1mPYki7m53hMRO6ly648qsj" }
];

function checkImage(img) {
  console.log(`Verificando imagen de ${img.name}:`, img.url);
  https.get(img.url, (res) => {
    console.log(`STATUS [${img.name}]:`, res.statusCode);
    console.log(`HEADERS [${img.name}]:`, {
        "content-type": res.headers["content-type"],
        "content-length": res.headers["content-length"],
        "location": res.headers["location"]
    });
    
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`[${img.name}] Redirige a:`, res.headers.location);
    }
  }).on('error', (err) => {
    console.error(`ERROR [${img.name}]:`, err.message);
  });
}

images.forEach(checkImage);
