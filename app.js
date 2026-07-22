/**
 * Bari S.A. - Vehículos Usados
 * Client-Side JavaScript Logic
 */

// --- CONFIGURATION ---
// Set this to 'cars-mock.csv' for local testing.
// In production, replace this with your Google Sheet published CSV URL.
// Example: 'https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pub?output=csv'
// const CSV_URL = 'cars-mock.csv';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNeU-0-iHoNdVLACtHnPEpWI_ImAiymdaV0BH_IU53w_7YsG51T5HiKU5t8pGpx8JiRQf3t7anzy0t/pub?output=csv';

// Contact WhatsApp number (with country code, no +, no spaces, e.g. '5492231234567')
const WHATSAPP_PHONE = '5492262354705'; // Bari S.A. contact number

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
                
                return {
                    id: cleanRow.patente || cleanRow.id || Math.random().toString(36).substring(2, 9),
                    marca: (cleanRow.marca || '').trim(),
                    modelo: (cleanRow.modelo || '').trim(),
                    version: (cleanRow.version || '').trim(),
                    anio: parseInt(cleanRow.anio) || new Date().getFullYear(),
                    precio: parseFloat(cleanRow.precio) || 0,
                    moneda: (cleanRow.moneda || 'USD').trim().toUpperCase(),
                    tipo: (cleanRow.tipo || 'Auto').trim(),
                    kilometros: parseInt(cleanRow.kilometros) || 0,
                    transmision: (cleanRow.transmision || 'Manual').trim(),
                    combustible: (cleanRow.combustible || 'Nafta').trim(),
                    color: (cleanRow.color || 'Gris').trim(),
                    ciudad: (cleanRow.sucursal || cleanRow.ciudad || 'Tandil').trim(),
                    imagenes: parseImagesField(cleanRow.imagenes),
                    descripcion: (cleanRow.descripcion || '').trim(),
                    estado: (cleanRow.estado || 'Disponible').trim()
                };
            });

            // Filter out empty rows (where brand or model is missing)
            vehicles = vehicles.filter(v => v.marca && v.modelo);
            
            // Build the filter dropdown menus dynamically
            buildFiltersDropdowns();
            
            // Render the initial grid
            applyFilters();
            showLoader(false);
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
        cityFilter.innerHTML = '<option value="all">Todas las ciudades</option>';
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
    modalCloseBtn.addEventListener('click', closeModal);
    modalCloseBackdrop.addEventListener('click', closeModal);
    
    // Close modal on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailsModal.classList.contains('hidden')) {
            closeModal();
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
            : 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=800'; // Clean placeholder car image

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
                <img src="${mainImage}" alt="${car.marca} ${car.modelo}" loading="lazy">
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
                        <span>${car.transmision}</span>
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
function openModal(car) {
    // Populate simple specs
    modalCarBrand.textContent = car.marca;
    modalCarTitle.textContent = car.modelo;
    modalCarVersion.textContent = car.version;
    modalCarPrice.textContent = `${car.moneda} ${formatNumber(car.precio)}`;
    modalSpecYear.textContent = car.anio;
    modalSpecKm.textContent = `${formatNumber(car.kilometros)} km`;
    modalSpecTransmission.textContent = car.transmision;
    modalSpecFuel.textContent = car.combustible;
    modalSpecColor.textContent = car.color;
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
        : ['https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=800'];
    
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
}

function closeModal() {
    detailsModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// --- GALLERY LOGIC ---
function updateModalGallery() {
    // Set main image
    modalMainImage.src = currentImages[currentImageIndex];
    modalMainImage.onerror = function() {
        this.src = 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=800';
    };
    
    // Navigation arrows visible state
    if (currentImages.length <= 1) {
        galleryPrev.classList.add('hidden');
        galleryNext.classList.add('hidden');
    } else {
        galleryPrev.classList.remove('hidden');
        galleryNext.classList.remove('hidden');
    }

    // Build thumbnails
    modalThumbnails.innerHTML = '';
    currentImages.forEach((url, index) => {
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.className = index === currentImageIndex ? 'thumbnail active' : 'thumbnail';
        thumb.alt = 'Miniatura';
        thumb.onclick = () => {
            currentImageIndex = index;
            updateModalGallery();
        };
        
        // Esconder si falla la carga (ej: DO Spaces autogenerado que no existe)
        thumb.onerror = function() {
            this.style.display = 'none';
            this.setAttribute('data-broken', 'true');
        };

        modalThumbnails.appendChild(thumb);
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
