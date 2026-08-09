/**
 * Bari S.A. - Vehículos Usados
 * Client-Side JavaScript Logic
 */

// --- CONFIGURATION ---
// Set this to 'cars-mock.csv' for local testing.
// In production, replace this with your Google Sheet published CSV URL.
// Example: 'https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pub?output=csv'
// const CSV_URL = 'cars-mock.csv';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsjdvcV1oZXIKTXmK2GAQgKlqceFDYtfHK55lVl8dn9CqQg7Qlh5tlEeLaAeptH_pJvYLKCb3zQQ1v/pub?gid=1061368151&single=true&output=csv';
const CONFIG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTsjdvcV1oZXIKTXmK2GAQgKlqceFDYtfHK55lVl8dn9CqQg7Qlh5tlEeLaAeptH_pJvYLKCb3zQQ1v/pub?gid=1740885014&single=true&output=csv';

// Contact WhatsApp number (with country code, no +, no spaces, e.g. '5492231234567')
const WHATSAPP_PHONE = '5492494516160'; // Bari S.A. contact number

// --- STATE MANAGEMENT ---
let vehicles = [];
let filteredVehicles = [];
let currentImages = [];
let currentImageIndex = 0;

const activeFilters = {
    query: '',
    city: 'all',
    brand: 'all',
    year: 'all',
    type: 'all',
    sort: 'default'
};

// --- DOM ELEMENTS ---
const searchInput = document.getElementById('search-input');
const cityFilter = document.getElementById('city-filter');
const brandFilter = document.getElementById('brand-filter');
const yearFilter = document.getElementById('year-filter');
const typeFilter = document.getElementById('type-filter');
const sortFilter = document.getElementById('sort-filter');
const catalogGrid = document.getElementById('catalog-grid');
const catalogLoader = document.getElementById('catalog-loader');
const noResults = document.getElementById('no-results');
const resetFiltersBtn = document.getElementById('reset-filters-btn');
const activeFiltersContainer = document.getElementById('active-filters-container');

// Modal Elements
const detailsModal = document.getElementById('details-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCloseBackdrop = document.getElementById('modal-close-backdrop');
const modalMainImage = document.getElementById('modal-main-image');
const modalCarStatus = document.getElementById('modal-car-status');
const modalThumbnails = document.getElementById('modal-thumbnails');
const modalCarBrand = document.getElementById('modal-car-brand');
const modalCarTitle = document.getElementById('modal-car-title');
const modalCarVersion = document.getElementById('modal-car-version');
const modalCarPrice = document.getElementById('modal-car-price');
const modalSpecYear = document.getElementById('modal-spec-year');
const modalSpecKm = document.getElementById('modal-spec-km');
const modalSpecTransmission = document.getElementById('modal-spec-transmission');
const modalSpecFuel = document.getElementById('modal-spec-fuel');
const modalSpecColor = document.getElementById('modal-spec-color');
const modalCarDescription = document.getElementById('modal-car-description');
const modalWhatsappBtn = document.getElementById('modal-whatsapp-btn');
const galleryPrev = document.getElementById('gallery-prev');
const galleryNext = document.getElementById('gallery-next');

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', () => {
    fetchAndLoadCatalog();
    setupEventListeners();
    setupCarouselSwipe();
    setupSocialCardButton();
    fetchAndLoadConfig();
    // Set footer year dynamically
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});

// --- LOAD DATA ---
function fetchAndLoadCatalog() {
    showLoader(true);
    
    // Auto-convert standard Google Sheets sharing links to direct CSV export links
    let targetUrl = CSV_URL;
    if (targetUrl && targetUrl.includes('/edit')) {
        targetUrl = targetUrl.split('/edit')[0] + '/export?format=csv';
    }
    
    // Fetch and parse the CSV file
    Papa.parse(targetUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.errors.length > 0) {
                console.warn('CSV parsing generated errors:', results.errors);
            }
            
            // Format, sanitize and normalize header keys
            vehicles = results.data.map(row => {
                const cleanRow = {};
                Object.keys(row).forEach(key => {
                    const cleanKey = key.trim().toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "") // remove accents
                        .replace(/\s+/g, '_');          // replace spaces with underscores
                    cleanRow[cleanKey] = row[key];
                });
                
                // Helper to parse numbers like "40.000" or "$58.000.000"
                const parseNumberString = (str) => {
                    if (!str) return 0;
                    return parseInt(str.toString().replace(/\D/g, '')) || 0;
                };

                const dominio = (cleanRow.dominio || cleanRow.patente || cleanRow.id || '').trim();

                // Generate DO urls from Dominio
                const doImages = [];
                if (dominio) {
                    for (let i = 1; i <= MAX_DO_IMAGES; i++) {
                        doImages.push(`https://bari-storage.sfo3.cdn.digitaloceanspaces.com/${dominio}/${i}.jpg`);
                    }
                }

                // Determine availability
                let estado = 'Disponible';
                if (cleanRow.disponible && cleanRow.disponible.toUpperCase() === 'NO') {
                    estado = 'Reservado'; // O Vendido
                } else if (cleanRow.estado && (cleanRow.estado.toLowerCase() === 'reservado' || cleanRow.estado.toLowerCase() === 'vendido')) {
                    estado = cleanRow.estado;
                }

                return {
                    id: dominio || Math.random().toString(36).substring(2, 9),
                    marca: (cleanRow.marca || '').trim(),
                    modelo: (cleanRow.descripcion_de_modelo || cleanRow.modelo || '').trim(),
                    version: (cleanRow.version || '').trim(),
                    anio: parseInt(cleanRow.ano || cleanRow.anio) || new Date().getFullYear(),
                    precio: parseNumberString(cleanRow.precio_final_en_ars || cleanRow.precio),
                    moneda: 'ARS', // Asumimos ARS por la columna precio_final_en_ars
                    tipo: (cleanRow.segmento || cleanRow.tipo || 'Auto').trim(),
                    kilometros: parseNumberString(cleanRow.km || cleanRow.kilometros),
                    transmision: (cleanRow.transmision || '').trim(),
                    combustible: (cleanRow.combustible || '').trim(),
                    color: (cleanRow.color || '').trim(),
                    ciudad: (cleanRow.sucursal || cleanRow.ciudad || 'Tandil').trim(),
                    imagenes: doImages.length > 0 ? doImages : parseImagesField(cleanRow.imagenes),
                    descripcion: (cleanRow.descripcion_para_publicacion || cleanRow.descripcion || '').trim(),
                    estado: estado,
                    publicar: (cleanRow.publicar || 'SI').trim().toUpperCase(),
                    anticipo: parseNumberString(cleanRow.anticipo),
                    cuotas: parseNumberString(cleanRow['12'] || cleanRow.cuotas_12 || cleanRow.cuotas),
                    financiador: (cleanRow.financiador || 'Bari').trim()
                };
            });

            // Filter out empty rows and rows marked not to publish
            vehicles = vehicles.filter(v => v.marca && v.modelo && v.publicar !== 'NO');
            
            // Generate unique SEO slugs
            const slugCounts = {};
            vehicles.forEach(car => {
                const rawSlug = `${car.marca} ${car.modelo} ${car.version} ${car.anio} ${car.ciudad}`
                    .toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
                    .replace(/[^a-z0-9]+/g, '-')                      // replace non-alphanumeric with dashes
                    .replace(/(^-|-$)+/g, '');                        // trim dashes
                
                if (slugCounts[rawSlug]) {
                    slugCounts[rawSlug]++;
                    car.slug = `${rawSlug}-${slugCounts[rawSlug]}`;
                } else {
                    slugCounts[rawSlug] = 1;
                    car.slug = rawSlug;
                }
            });

            // Build the filter dropdown menus dynamically
            buildFiltersDropdowns();
            
            // Render the initial grid
            applyFilters();
            showLoader(false);

            // Check for deep link right after loading the catalog
            checkDeepLink();
        },
        error: function(err) {
            console.error('Error fetching CSV:', err);
            showErrorState();
        }
    });
}

// Transform Google Drive URL to a direct image link
function transformDriveUrl(url) {
    if (!url) return '';
    url = url.trim();
    
    // Regular expression to match standard share link format: /file/d/[FILE_ID]/view
    const regExp = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = url.match(regExp);
    if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    
    // Query parameter match for open?id= or uc?id=
    const queryRegExp = /[?&]id=([a-zA-Z0-9_-]+)/;
    const queryMatch = url.match(queryRegExp);
    if (queryMatch && queryMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${queryMatch[1]}`;
    }
    
    return url;
}

// Parse image field.
// Supports two formats:
// 1. Semicolon-separated list of Google Drive URLs (legacy).
// 2. A single base URL from Digital Ocean Spaces ending in '/' (new).
//    In this case, the code auto-generates URLs for 1.jpg, 2.jpg ... up to MAX_DO_IMAGES.
const MAX_DO_IMAGES = 8; // Max photos per vehicle to probe

function parseImagesField(imageField) {
    if (!imageField) return [];
    const trimmed = imageField.trim();

    // Format 2: Digital Ocean folder URL
    if (trimmed.includes('digitaloceanspaces.com') && trimmed.endsWith('/')) {
        const urls = [];
        for (let i = 1; i <= MAX_DO_IMAGES; i++) {
            // Actualmente fuerza .jpg. Si se usan .png, no cargan. 
            urls.push(`${trimmed}${i}.jpg`);
        }
        return urls;
    }

    // Format 1: Semicolon-separated Drive URLs (legacy / fallback)
    return trimmed
        .split(';')
        .map(url => url.trim())
        .filter(url => url.length > 0)
        .map(url => transformDriveUrl(url));
}

// --- BUILD FILTERS ---
function buildFiltersDropdowns() {
    // Unique Cities
    const cities = [...new Set(vehicles.map(v => v.ciudad))].sort();
    if(cityFilter) {
        cityFilter.innerHTML = '<option value="all">Todas las ubicaciones</option>';
        cities.forEach(city => {
            cityFilter.innerHTML += `<option value="${city}">${city}</option>`;
        });
    }

    // Unique Brands
    const brands = [...new Set(vehicles.map(v => v.marca))].sort();
    brandFilter.innerHTML = '<option value="all">Todas las marcas</option>';
    brands.forEach(brand => {
        brandFilter.innerHTML += `<option value="${brand}">${brand}</option>`;
    });

    // Unique Years (Sorted Descending)
    const years = [...new Set(vehicles.map(v => v.anio))].sort((a, b) => b - a);
    yearFilter.innerHTML = '<option value="all">Cualquier año</option>';
    years.forEach(year => {
        yearFilter.innerHTML += `<option value="${year}">${year} o posterior</option>`;
    });

    // Unique Types
    const types = [...new Set(vehicles.map(v => v.tipo))].sort();
    if(typeFilter) {
        typeFilter.innerHTML = '<option value="all">Todos los tipos</option>';
        types.forEach(t => {
            if(t) typeFilter.innerHTML += `<option value="${t}">${t}</option>`;
        });
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Search input typing
    searchInput.addEventListener('input', (e) => {
        activeFilters.query = e.target.value.toLowerCase().trim();
        applyFilters();
    });

    // Select filters
    if(cityFilter) {
        cityFilter.addEventListener('change', (e) => {
            activeFilters.city = e.target.value;
            applyFilters();
        });
    }

    brandFilter.addEventListener('change', (e) => {
        activeFilters.brand = e.target.value;
        applyFilters();
    });

    yearFilter.addEventListener('change', (e) => {
        activeFilters.year = e.target.value;
        applyFilters();
    });

    if(typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            activeFilters.type = e.target.value;
            applyFilters();
        });
    }

    sortFilter.addEventListener('change', (e) => {
        activeFilters.sort = e.target.value;
        applyFilters();
    });

    // Reset button
    resetFiltersBtn.addEventListener('click', resetAllFilters);

    // Modal Close
    modalCloseBtn.addEventListener('click', () => closeModal(false));
    modalCloseBackdrop.addEventListener('click', (e) => {
        if(e.target === modalCloseBackdrop) closeModal(false);
    });
    
    // Close modal on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailsModal.classList.contains('hidden')) {
            closeModal(false);
        }
    });

    // Browser back/forward support (popstate)
    window.addEventListener('popstate', (e) => {
        const carSlug = getUrlParam('auto');
        if (carSlug) {
            const car = vehicles.find(v => v.slug === carSlug);
            if (car) openModal(car, true); // true = skip pushState
        } else {
            closeModal(true); // true = skip pushState
        }
    });

    // Gallery navigation
    galleryPrev.addEventListener('click', () => navigateGallery(-1));
    galleryNext.addEventListener('click', () => navigateGallery(1));
}

// --- APPLY FILTERS & SORT ---
function applyFilters() {
    filteredVehicles = vehicles.filter(car => {
        // Search query filter
        const matchesQuery = !activeFilters.query || 
            car.marca.toLowerCase().includes(activeFilters.query) ||
            car.modelo.toLowerCase().includes(activeFilters.query) ||
            car.version.toLowerCase().includes(activeFilters.query) ||
            car.descripcion.toLowerCase().includes(activeFilters.query);

        // City filter
        const matchesCity = activeFilters.city === 'all' || car.ciudad === activeFilters.city;

        // Brand filter
        const matchesBrand = activeFilters.brand === 'all' || car.marca === activeFilters.brand;

        // Year filter
        const matchesYear = activeFilters.year === 'all' || car.anio >= parseInt(activeFilters.year);

        // Type filter
        const matchesType = activeFilters.type === 'all' || car.tipo === activeFilters.type;

        return matchesQuery && matchesCity && matchesBrand && matchesYear && matchesType;
    });

    // Sorting
    sortVehicles();

    // Render components
    renderActivePills();
    renderCatalogGrid();
}

function sortVehicles() {
    switch (activeFilters.sort) {
        case 'price-asc':
            filteredVehicles.sort((a, b) => a.precio - b.precio);
            break;
        case 'price-desc':
            filteredVehicles.sort((a, b) => b.precio - a.precio);
            break;
        case 'year-desc':
            filteredVehicles.sort((a, b) => b.anio - a.anio);
            break;
        case 'km-asc':
            filteredVehicles.sort((a, b) => a.kilometros - b.kilometros);
            break;
        default:
            // Default sort: Available first, then sort by year descending
            filteredVehicles.sort((a, b) => {
                if (a.estado === 'Disponible' && b.estado !== 'Disponible') return -1;
                if (a.estado !== 'Disponible' && b.estado === 'Disponible') return 1;
                return b.anio - a.anio;
            });
    }
}

// --- RENDER FUNCTIONS ---
function renderCatalogGrid() {
    catalogGrid.innerHTML = '';
    
    if (filteredVehicles.length === 0) {
        catalogGrid.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    catalogGrid.classList.remove('hidden');

    filteredVehicles.forEach(car => {
        const mainImage = car.imagenes.length > 0 
            ? car.imagenes[0] 
            : 'logo-bari.jpg'; // Clean placeholder car image

        // Create Badge markup
        let statusClass = 'badge-available';
        if (car.estado === 'Reservado') statusClass = 'badge-reserved';
        if (car.estado === 'Vendido') statusClass = 'badge-sold';

        // Dim sold cars
        const isSold = car.estado === 'Vendido';
        const cardOpacityStyle = isSold ? 'style="opacity: 0.65;"' : '';

        const card = document.createElement('article');
        card.className = 'car-card';
        card.setAttribute('aria-label', `${car.marca} ${car.modelo} ${car.anio}`);
        card.innerHTML = `
            <div class="car-image-wrapper" ${cardOpacityStyle}>
                <img src="${mainImage}" alt="${car.marca} ${car.modelo}" loading="lazy" onerror="this.onerror=null;this.src='logo-bari.jpg';">
                <span class="car-status-badge ${statusClass}">${car.estado}</span>
            </div>
            <div class="car-info">
                <span class="car-brand-label">${car.marca}</span>
                <div class="car-title-row">
                    <h2>${car.modelo}</h2>
                    <span class="car-version-label">${car.version}</span>
                </div>
                <div class="car-meta-row">
                    <div class="car-meta-item">
                        <span>${car.anio}</span>
                    </div>
                    <div class="car-meta-item">
                        <span>${formatNumber(car.kilometros)} km</span>
                    </div>
                    <div class="car-meta-item">
                        <span>${car.ciudad}</span>
                    </div>
                </div>
                <div class="car-price-row">
                    <span class="car-price-value">${car.moneda} ${formatNumber(car.precio)}</span>
                    <span class="car-view-details">
                        Ver Detalles
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </span>
                </div>
            </div>
        `;
        
        // Open modal on click
        card.addEventListener('click', () => openModal(car));
        catalogGrid.appendChild(card);
    });
}

// Render filter pills
function renderActivePills() {
    activeFiltersContainer.innerHTML = '';
    
    // Add city pill
    if (activeFilters.city !== 'all') {
        createPill('Ciudad', activeFilters.city, () => {
            activeFilters.city = 'all';
            if(cityFilter) cityFilter.value = 'all';
            applyFilters();
        });
    }

    // Add brand pill
    if (activeFilters.brand !== 'all') {
        createPill('Marca', activeFilters.brand, () => {
            activeFilters.brand = 'all';
            brandFilter.value = 'all';
            applyFilters();
        });
    }

    // Add year pill
    if (activeFilters.year !== 'all') {
        createPill('Año', `>= ${activeFilters.year}`, () => {
            activeFilters.year = 'all';
            yearFilter.value = 'all';
            applyFilters();
        });
    }

    // Add type pill
    if (activeFilters.type !== 'all') {
        createPill('Tipo', activeFilters.type, () => {
            activeFilters.type = 'all';
            if(typeFilter) typeFilter.value = 'all';
            applyFilters();
        });
    }

    // Add query pill
    if (activeFilters.query !== '') {
        createPill('Búsqueda', `"${activeFilters.query}"`, () => {
            activeFilters.query = '';
            searchInput.value = '';
            applyFilters();
        });
    }
}

function createPill(category, label, onRemove) {
    const pill = document.createElement('div');
    pill.className = 'active-filter-pill';
    pill.innerHTML = `
        <span><strong>${category}:</strong> ${label}</span>
        <button aria-label="Remover filtro ${label}">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;
    pill.querySelector('button').addEventListener('click', onRemove);
    activeFiltersContainer.appendChild(pill);
}

// --- MODAL ACTIONS ---
function openModal(car, skipPushState = false) {
    currentCarData = car; // Store for social card generation

    // Populate simple specs
    modalCarBrand.textContent = car.marca;
    modalCarTitle.textContent = car.modelo;
    modalCarVersion.textContent = car.version;
    modalCarPrice.textContent = `${car.moneda} ${formatNumber(car.precio)}`;
    modalSpecYear.textContent = car.anio;
    modalSpecKm.textContent = `${formatNumber(car.kilometros)} km`;
    modalSpecTransmission.textContent = car.transmision || '-';
    modalSpecFuel.textContent = car.combustible || '-';
    modalSpecColor.textContent = car.color || '-';
    modalCarDescription.textContent = car.descripcion || 'Sin descripción adicional disponible.';
    
    // Status Badge setup
    modalCarStatus.textContent = car.estado;
    modalCarStatus.className = 'car-status-badge';
    if (car.estado === 'Disponible') modalCarStatus.classList.add('badge-available');
    else if (car.estado === 'Reservado') modalCarStatus.classList.add('badge-reserved');
    else if (car.estado === 'Vendido') modalCarStatus.classList.add('badge-sold');

    // Gallery configuration
    currentImages = car.imagenes.length > 0 
        ? car.imagenes 
        : ['logo-bari.jpg'];
    
    // Build thumbnails once when opening modal
    modalThumbnails.innerHTML = '';
    currentImages.forEach((url, index) => {
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.className = index === 0 ? 'thumbnail active' : 'thumbnail';
        thumb.alt = 'Miniatura';
        thumb.onclick = () => {
            currentImageIndex = index;
            updateModalGallery();
        };
        
        // Esconder si falla la carga
        thumb.onerror = function() {
            this.style.display = 'none';
            this.setAttribute('data-broken', 'true');
        };

        modalThumbnails.appendChild(thumb);
    });

    currentImageIndex = 0;
    updateModalGallery();

    // WhatsApp CTA building
    const whatsappMessage = `Hola Bari S.A.! Quisiera consultar sobre el vehículo ${car.marca} ${car.modelo} ${car.version} (${car.anio}) publicado por USD ${formatNumber(car.precio)}. ¿Sigue disponible?`;
    modalWhatsappBtn.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(whatsappMessage)}`;

    // If sold, disable WhatsApp button and change style
    if (car.estado === 'Vendido') {
        modalWhatsappBtn.classList.add('hidden');
    } else {
        modalWhatsappBtn.classList.remove('hidden');
    }

    // Show modal and prevent body scrolling
    detailsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // SEO & Deep Linking: Update URL and Meta tags
    if (!skipPushState) {
        updateUrlParam('auto', car.slug);
    }
    
    document.title = `${car.marca} ${car.modelo} ${car.anio} | Bari Usados`;
    let metaDesc = document.querySelector('meta[name="description"]');
    if(metaDesc) metaDesc.setAttribute('content', `Comprá tu ${car.marca} ${car.modelo} ${car.version} (${car.anio}) usado verificado en Bari.`);
    
    let ogImage = document.querySelector('meta[property="og:image"]');
    if(ogImage && currentImages.length > 0) {
        ogImage.setAttribute('content', currentImages[0]);
    }

    // Dynamic JSON-LD for this specific car
    injectVehicleSchema(car);
}

function closeModal(skipPushState = false) {
    detailsModal.classList.add('hidden');
    document.body.style.overflow = '';

    if (!skipPushState) {
        updateUrlParam('auto', null);
    }

    // Restore original Meta tags
    document.title = ORIGINAL_TITLE;
    let metaDesc = document.querySelector('meta[name="description"]');
    if(metaDesc) metaDesc.setAttribute('content', ORIGINAL_DESC);
    
    let ogImage = document.querySelector('meta[property="og:image"]');
    if(ogImage) ogImage.setAttribute('content', ORIGINAL_OG_IMAGE);

    removeVehicleSchema();
}

// --- GALLERY LOGIC ---
function updateModalGallery() {
    // Set main image
    modalMainImage.src = currentImages[currentImageIndex];
    modalMainImage.onerror = function() {
        this.src = 'logo-bari.jpg';
    };
    
    // Navigation arrows visible state
    if (currentImages.length <= 1) {
        galleryPrev.classList.add('hidden');
        galleryNext.classList.add('hidden');
    } else {
        galleryPrev.classList.remove('hidden');
        galleryNext.classList.remove('hidden');
    }

    // Update thumbnails active state without recreating them
    const thumbs = modalThumbnails.querySelectorAll('.thumbnail');
    thumbs.forEach((thumb, index) => {
        if (index === currentImageIndex) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });
}

function navigateGallery(direction) {
    // Prevent wrapping around logic
    let nextIndex = currentImageIndex + direction;
    if (nextIndex < 0) nextIndex = currentImages.length - 1;
    if (nextIndex >= currentImages.length) nextIndex = 0;
    
    // Skip broken images
    const thumbs = document.querySelectorAll('.thumbnail');
    let attempts = 0;
    while(thumbs[nextIndex] && thumbs[nextIndex].getAttribute('data-broken') === 'true' && attempts < currentImages.length) {
        nextIndex = nextIndex + direction;
        if (nextIndex < 0) nextIndex = currentImages.length - 1;
        if (nextIndex >= currentImages.length) nextIndex = 0;
        attempts++;
    }
    
    currentImageIndex = nextIndex;
    updateModalGallery();
}

// --- HELPERS ---
function resetAllFilters() {
    searchInput.value = '';
    if(cityFilter) cityFilter.value = 'all';
    brandFilter.value = 'all';
    yearFilter.value = 'all';
    if(typeFilter) typeFilter.value = 'all';
    sortFilter.value = 'default';
    
    activeFilters.query = '';
    activeFilters.city = 'all';
    activeFilters.brand = 'all';
    activeFilters.year = 'all';
    activeFilters.type = 'all';
    activeFilters.sort = 'default';
    
    applyFilters();
}

function showLoader(show) {
    if (show) {
        catalogLoader.classList.remove('hidden');
        catalogGrid.classList.add('hidden');
        noResults.classList.add('hidden');
    } else {
        catalogLoader.classList.add('hidden');
    }
}

function showErrorState() {
    catalogLoader.classList.add('hidden');
    catalogGrid.classList.add('hidden');
    noResults.classList.remove('hidden');
    noResults.querySelector('h3').textContent = 'Error al cargar los datos';
    noResults.querySelector('p').textContent = 'Ocurrió un error al leer la base de datos de Google Sheets. Intente de nuevo más tarde.';
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// --- SWIPE SUPPORT FOR MOBILE CAROUSEL ---
function setupCarouselSwipe() {
    const mainImg = document.getElementById('modal-main-image');
    if (!mainImg) return;

    let touchStartX = 0;
    let touchEndX = 0;

    mainImg.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    mainImg.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) { // min swipe distance
            navigateGallery(diff > 0 ? 1 : -1);
        }
    }, { passive: true });
}

// --- SOCIAL CARD GENERATOR ---
// N8N webhook URL for social card upload
// Replace with your actual n8n webhook URL for the social image flow
const N8N_SOCIAL_WEBHOOK = 'https://bipolos.app.n8n.cloud/webhook/bari-social-image';

let currentCarData = null; // Store current car data for social card

function setupSocialCardButton() {
    const btn = document.getElementById('social-card-btn');
    if (!btn) return;

    // Check URL param or session (so it persists while navigating the page)
    const urlParams = new URLSearchParams(window.location.search);
    const isAdmin = urlParams.get('admin') === 'bari2025' || sessionStorage.getItem('bari_admin') === 'true';

    if (isAdmin) {
        // Save in session so it survives page reloads within the same tab
        sessionStorage.setItem('bari_admin', 'true');
        btn.classList.remove('hidden');
    }

    btn.addEventListener('click', generateSocialCard);
}

async function generateSocialCard() {
    if (!currentCarData) return;

    const btn = document.getElementById('social-card-btn');
    btn.disabled = true;
    btn.textContent = 'Generando...';

    try {
        // 1. Populate the hidden social card with current car data
        populateSocialCard(currentCarData);

        // 2. Wait a tick for the DOM to paint
        await new Promise(r => setTimeout(r, 300));

        // 3. Capture the card with html2canvas
        const canvas = await html2canvas(document.getElementById('social-card'), {
            scale: 1,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            width: 1080,
            logging: false
        });

        // 4. Convert canvas to blob (JPEG, 92% quality)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        const base64 = await blobToBase64(blob);

        // 5. Send to n8n webhook
        const patente = currentCarData.patente || currentCarData.id || 'sin-patente';
        await sendToN8N(base64, patente, currentCarData);

        btn.textContent = '✅ Imagen enviada a n8n!';
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Generar imagen para Redes`;
        }, 3000);

    } catch (err) {
        console.error('Error generando imagen:', err);
        // Fallback: descarga directa al celular/compu
        try {
            const canvas = await html2canvas(document.getElementById('social-card'), {
                scale: 1, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', width: 1080
            });
            const link = document.createElement('a');
            link.download = `${currentCarData.patente || 'bari-auto'}-social.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.92);
            link.click();
            btn.textContent = '📥 Descargada localmente';
        } catch(e2) {
            btn.textContent = '❌ Error - Intentá de nuevo';
        }
        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Generar imagen para Redes`;
        }, 3000);
    }
}

function populateSocialCard(car) {
    // Image: use the first image of the car
    const scImage = document.getElementById('sc-image');
    scImage.src = car.imagenes && car.imagenes.length > 0 
        ? car.imagenes[0] 
        : 'logo-bari.jpg';

    // Status
    const scStatus = document.getElementById('sc-status');
    scStatus.textContent = car.estado === 'Disponible' ? 'UNIDAD DISPONIBLE' : car.estado.toUpperCase();
    
    // Si no está disponible, el mockup no dice nada sobre colores, pero dejemos el texto en negro o destacado
    // El mockup tiene "UNIDAD DISPONIBLE" con borde y fondo blanco, letras negras. Lo estilizaremos en CSS.

    // Model
    document.getElementById('sc-model').textContent = `${car.marca} ${car.modelo}`;

    // Specs
    document.getElementById('sc-km').textContent = formatNumber(car.kilometros);
    document.getElementById('sc-year').textContent = car.anio;

    // Price / Financing
    const priceBlock = document.getElementById('sc-price-block');
    const financingBlock = document.getElementById('sc-financing-block');
    
    if (car.anticipo > 0 && car.cuotas > 0) {
        if(priceBlock) priceBlock.style.display = 'none';
        if(financingBlock) financingBlock.style.display = 'flex';
        document.getElementById('sc-anticipo').textContent = `$ ${formatNumber(car.anticipo)}`;
        document.getElementById('sc-cuotas').textContent = `$ ${formatNumber(car.cuotas)}`;
    } else {
        if(priceBlock) priceBlock.style.display = 'flex';
        if(financingBlock) financingBlock.style.display = 'none';
        if(document.getElementById('sc-price')) document.getElementById('sc-price').textContent = `$ ${formatNumber(car.precio)}`;
    }

    // Financiador
    const scFinanciador = document.getElementById('sc-financiador');
    if (scFinanciador) {
        scFinanciador.textContent = car.financiador || 'Bari';
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]); // strip data:...;base64,
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- FETCH CONFIG ---
function fetchAndLoadConfig() {
    let targetUrl = CONFIG_CSV_URL;
    if (targetUrl && targetUrl.includes('/edit')) {
        targetUrl = targetUrl.split('/edit')[0] + '/export?format=csv';
    }

    Papa.parse(targetUrl, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.errors.length > 0) {
                console.warn('Config CSV parsing errors:', results.errors);
            }
            if (!results.data || results.data.length === 0) return;
            
            const configRow = results.data[0];
            const cleanConfig = {};
            Object.keys(configRow).forEach(key => {
                const cleanKey = key.trim().toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
                    .replace(/\s+/g, '_');
                cleanConfig[cleanKey] = configRow[key];
            });

            // Email
            if (cleanConfig.email) {
                const el = document.getElementById('footer-email');
                if (el) {
                    el.href = 'mailto:' + cleanConfig.email;
                    el.textContent = cleanConfig.email;
                }
            }
            // Socials
            if (cleanConfig.instagram) {
                const el = document.getElementById('footer-ig');
                if (el) el.href = cleanConfig.instagram;
            }
            if (cleanConfig.facebook) {
                const el = document.getElementById('footer-fb');
                if (el) el.href = cleanConfig.facebook;
            }

            // Tagline (Texto arriba del mail)
            if (cleanConfig.texto_arriba) {
                const el = document.getElementById('footer-tagline');
                if (el) el.innerHTML = cleanConfig.texto_arriba;
            }

            // Helper to inject text directly
            const injectText = (id, key) => {
                const el = document.getElementById(id);
                if (cleanConfig[key] && el) {
                    el.innerHTML = cleanConfig[key];
                }
            };

            // Helper to inject phone/text and hide if empty
            const injectPhone = (id, key, prefix = '') => {
                const el = document.getElementById(id);
                const li = document.getElementById('li-' + id);
                if (cleanConfig[key]) {
                    if (el) {
                        el.href = 'tel:' + cleanConfig[key].replace(/\D/g, '');
                        el.textContent = prefix + cleanConfig[key];
                    }
                    if (li) li.style.display = 'list-item';
                } else {
                    if (li) li.style.display = 'none';
                }
            };

            // Tandil
            injectPhone('tandil-gen', 'tandil_general');
            injectPhone('tandil-adm', 'tandil_adm');
            injectPhone('tandil-serv', 'tandil_serv');
            injectPhone('tandil-rep', 'tandil_rep');
            injectText('tandil-hours', 'horarios_tandil');

            // Olavarría
            injectPhone('ola-gen', 'olavarria_general');
            injectPhone('ola-adm', 'olavarria_adm');
            injectPhone('ola-serv', 'olavarria_serv');
            injectPhone('ola-rep', 'olavarria_rep');
            injectText('ola-hours', 'horarios_olavarria');

            // Bahía Blanca
            injectPhone('bahia-gen', 'bahia_general');
            injectPhone('bahia-adm', 'bahia_adm');
            injectPhone('bahia-serv', 'bahia_serv');
            injectPhone('bahia-rep', 'bahia_rep');
            injectText('bahia-hours', 'horarios_bahia');
        }
    });
}

async function sendToN8N(base64Image, patente, car) {
    const payload = {
        action: 'upload_social_image',
        patente: patente,
        marca: car.marca,
        modelo: car.modelo,
        anio: car.anio,
        precio: car.precio,
        moneda: car.moneda,
        image_base64: base64Image,
        image_mime: 'image/jpeg',
        filename: `${patente}/social.jpeg`
    };

    const response = await fetch(N8N_SOCIAL_WEBHOOK, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`n8n respondió con status ${response.status}`);
    }

    return response;
}

// --- URL STATE AND SEO HELPERS ---
const ORIGINAL_TITLE = document.title;
const ORIGINAL_DESC = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
const ORIGINAL_OG_IMAGE = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

function getUrlParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

function updateUrlParam(key, value) {
    const url = new URL(window.location);
    if (value === null || value === '') {
        url.searchParams.delete(key);
    } else {
        url.searchParams.set(key, value);
    }
    window.history.pushState({ carId: value }, '', url);
}

function checkDeepLink() {
    const carSlug = getUrlParam('auto');
    if (carSlug) {
        const car = vehicles.find(v => v.slug === carSlug);
        if (car) {
            openModal(car, true); // true = we don't need to pushState because it's already in the URL
        }
    }
}

function injectVehicleSchema(car) {
    removeVehicleSchema(); // Clean up previous if any
    
    const schema = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": `${car.marca} ${car.modelo} ${car.version}`,
      "image": car.imagenes,
      "description": `Vehículo usado ${car.marca} ${car.modelo} año ${car.anio}. Km: ${car.kilometros}.`,
      "sku": car.id,
      "offers": {
        "@type": "Offer",
        "url": window.location.href,
        "priceCurrency": car.moneda || "ARS",
        "price": car.precio,
        "itemCondition": "https://schema.org/UsedCondition",
        "availability": car.estado === 'Disponible' ? "https://schema.org/InStock" : "https://schema.org/SoldOut"
      }
    };
    
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'dynamic-vehicle-schema';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);
}

function removeVehicleSchema() {
    const existing = document.getElementById('dynamic-vehicle-schema');
    if (existing) {
        existing.remove();
    }
}
